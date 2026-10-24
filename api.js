/**
 * Thin client for the AWS backend (Lambda Function URL + DynamoDB).
 * If APP_CONFIG.API_URL is empty, Api.enabled() is false and the app
 * falls back to localStorage demo mode.
 */
const Api = {
    base() {
        const url = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
        return url.replace(/\/+$/, '');
    },

    enabled() {
        return this.base() !== '';
    },

    async request(method, path, body, headers = {}) {
        const res = await fetch(this.base() + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined
        });
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            /* empty or non-JSON body */
        }
        if (!res.ok) {
            const msg = (data && data.error) || `Request failed (${res.status})`;
            throw new Error(msg);
        }
        return data;
    },

    submitStudent(student) {
        return this.request('POST', '/students', student);
    },

    submitMentor(mentor) {
        return this.request('POST', '/mentors', mentor);
    },

    listMentors() {
        return this.request('GET', '/mentors');
    },

    adminData(adminKey) {
        return this.request('GET', '/admin/data', null, { 'x-admin-key': adminKey });
    }
};
