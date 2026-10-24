/**
 * Mentor Match API - AWS Lambda (Node.js 20.x / 22.x), exposed via a Function URL.
 *
 * Routes
 *   POST /students     save a student survey             (public)
 *   POST /mentors      save a mentor registration        (public)
 *   GET  /mentors      list mentors WITHOUT emails       (public)
 *   GET  /admin/data   all students + mentors, full      (header x-admin-key)
 *
 * Environment variables
 *   TABLE_NAME   DynamoDB table name (partition key "pk", sort key "sk", both String)
 *   ADMIN_KEY    long random secret for the admin page
 *   DATA_BUCKET  (optional) PRIVATE S3 bucket; each submission is also saved as
 *                submissions/<students|mentors>/dt=YYYY-MM-DD/<id>.json
 *
 * CORS is configured on the Function URL itself, NOT in this code
 * (setting it in both places produces duplicate headers and the browser rejects them).
 *
 * The AWS SDK v3 is built into the Lambda Node.js runtime - no npm install needed.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const DATA_BUCKET = process.env.DATA_BUCKET;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true }
});
const TABLE = process.env.TABLE_NAME;
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const MAX_BODY_BYTES = 20_000;
const SHORT = 200;   // names, titles, select values
const LONG = 3000;   // free-text answers

// Whitelist: field -> 'short' | 'long' | 'list'. Anything else is dropped.
const STUDENT_FIELDS = {
    name: 'short', email: 'short', major: 'short', year: 'short',
    passion: 'long', mentorStyle: 'short', meetingPreference: 'short',
    availableDays: 'list', challenges: 'long', goals: 'long'
};
const STUDENT_REQUIRED = ['name', 'email', 'major', 'year', 'passion'];

const MENTOR_FIELDS = {
    name: 'short', email: 'short', title: 'short', company: 'short', field: 'short',
    yearsExperience: 'short', expertise: 'list', bio: 'long', degree: 'short',
    almaMater: 'short', sjsuAlumnus: 'short', canHelpWith: 'list',
    menteeCapacity: 'short', availability: 'short', availableDays: 'list',
    mentorshipStyle: 'short', preferredMajors: 'list', motivation: 'long',
    achievements: 'long', additional: 'long'
};
const MENTOR_REQUIRED = ['name', 'email', 'title', 'company', 'field',
    'yearsExperience', 'expertise', 'degree', 'sjsuAlumnus', 'canHelpWith'];

// Fields hidden from the public mentor list
const MENTOR_PRIVATE = ['email'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

function clean(input, schema, required) {
    const out = {};
    for (const [key, kind] of Object.entries(schema)) {
        const v = input[key];
        if (v === undefined || v === null) continue;
        if (kind === 'list') {
            if (!Array.isArray(v)) continue;
            out[key] = v.slice(0, 20).map(x => String(x).slice(0, SHORT));
        } else {
            out[key] = String(v).trim().slice(0, kind === 'long' ? LONG : SHORT);
        }
    }
    for (const key of required) {
        const v = out[key];
        if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
            throw new Error(`Missing required field: ${key}`);
        }
    }
    if (!EMAIL_RE.test(out.email)) throw new Error('Invalid email address');
    return out;
}

function parseBody(event) {
    if (!event.body) throw new Error('Request body is empty');
    const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('Request body too large');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Body must be a JSON object');
    }
    return data;
}

async function save(type, item) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const record = { pk: type, sk: `${now}#${id}`, id, timestamp: now, ...item };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));

    // Second copy: one JSON file per submission in the private data bucket.
    // If this fails, the submission is still saved in DynamoDB, so log it
    // instead of showing the visitor an error (which would cause a duplicate retry).
    if (DATA_BUCKET) {
        const folder = type === 'STUDENT' ? 'students' : 'mentors';
        const day = now.slice(0, 10); // YYYY-MM-DD
        try {
            await s3.send(new PutObjectCommand({
                Bucket: DATA_BUCKET,
                Key: `submissions/${folder}/dt=${day}/${id}.json`,
                Body: JSON.stringify(record),
                ContentType: 'application/json'
            }));
        } catch (err) {
            console.error('S3 copy failed', id, err);
        }
    }
    return { id, timestamp: now };
}

async function listAll(type) {
    const items = [];
    let ExclusiveStartKey;
    do {
        const res = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': type },
            ScanIndexForward: false, // newest first
            ExclusiveStartKey
        }));
        items.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items.map(({ pk, sk, ...rest }) => rest);
}

function isAdmin(event) {
    const given = (event.headers && event.headers['x-admin-key']) || '';
    if (ADMIN_KEY.length < 16 || given.length !== ADMIN_KEY.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(ADMIN_KEY));
}

export const handler = async (event) => {
    const method = event.requestContext?.http?.method || 'GET';
    const path = (event.rawPath || '/').replace(/\/+$/, '') || '/';

    try {
        if (method === 'POST' && path === '/students') {
            const student = clean(parseBody(event), STUDENT_FIELDS, STUDENT_REQUIRED);
            return json(201, await save('STUDENT', student));
        }

        if (method === 'POST' && path === '/mentors') {
            const mentor = clean(parseBody(event), MENTOR_FIELDS, MENTOR_REQUIRED);
            return json(201, await save('MENTOR', mentor));
        }

        if (method === 'GET' && path === '/mentors') {
            const mentors = (await listAll('MENTOR')).map(m => {
                const copy = { ...m };
                MENTOR_PRIVATE.forEach(k => delete copy[k]);
                return copy;
            });
            return json(200, { mentors });
        }

        if (method === 'GET' && path === '/admin/data') {
            if (!isAdmin(event)) return json(401, { error: 'Wrong admin key' });
            const [students, mentors] = await Promise.all([listAll('STUDENT'), listAll('MENTOR')]);
            return json(200, { students, mentors });
        }

        if (method === 'GET' && path === '/') {
            return json(200, { ok: true, service: 'mentor-match-api' });
        }

        return json(404, { error: 'Not found' });
    } catch (err) {
        if (err instanceof SyntaxError) return json(400, { error: 'Body is not valid JSON' });
        if (err.message && /Missing required|Invalid email|too large|empty|must be/.test(err.message)) {
            return json(400, { error: err.message });
        }
        console.error(err);
        return json(500, { error: 'Server error' });
    }
};
