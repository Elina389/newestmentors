/**
 * Mentor-Mentee Matching Algorithm
 * 
 * Uses weighted semantic matching to calculate compatibility scores.
 * 
 * ALGORITHM EXPLANATION:
 * =====================
 * 
 * This algorithm uses a weighted scoring system where each criterion contributes
 * a specific percentage to the overall match score. The total possible score is 100.
 * 
 * WEIGHTS:
 * --------
 * 1. Passion Analysis (40 points = 40% weight)
 *    - Analyzes student's open-ended passion description
 *    - Uses semantic keyword matching against mentor's expertise
 *    - Extracts concepts and topics from text
 *    - Example: "I love building AI systems" matches "Data Science & Analytics"
 * 
 * 2. Major Match (30 points = 30% weight)
 *    - Boolean match: student's major vs mentor's preferred majors
 *    - Exact match or mentor accepts "Any" major
 * 
 * 3. Mentorship Style (15 points = 15% weight)
 *    - Compares preferred mentoring approaches
 *    - Bonus if mentor is adaptable to any style
 * 
 * 4. Availability Match (10 points = 10% weight)
 *    - Meeting frequency: Weekly/Bi-weekly/Monthly/As needed
 *    - Available days: Monday-Sunday overlap
 *    - Higher score for more day matches
 *    - Optional field: partial points if only frequency matches
 * 
 * TOTAL: 95 points → converted to percentage of 95 (0-100%)
 * 
 * Note: The "challenges" and "goals" fields are NOT used in matching.
 * They are informational only, collected for administrators to understand
 * student needs when reviewing matches.
 */

class MatchingSystem {
    constructor() {
        // localStorage only holds data for THIS browser. On the deployed site,
        // real submissions go to the AWS backend (see api.js); this is the
        // offline/demo fallback when config.js has no API_URL.
        this.students = this._load('students');
        this.mentors = this._load('mentors');
        this.currentUser = null;

        // Define weights for each criterion
        this.weights = {
            passion: 40,        // 40% - Most important
            major: 30,          // 30% - Very important
            style: 15,          // 15% - Moderately important
            availability: 10    // 10% - Includes both frequency and days
        };

        // Define keyword mappings for semantic matching
        this.passionKeywords = {
            // Technology & Development
            'software': ['Software Development', 'Technical Skills', 'Career Development'],
            'coding': ['Software Development', 'Technical Skills'],
            'programming': ['Software Development', 'Technical Skills'],
            'develop': ['Software Development', 'Product Management'],
            'build': ['Software Development', 'Entrepreneurship'],
            'app': ['Software Development', 'Product Management'],
            'web': ['Software Development', 'Technical Skills'],
            
            // AI & Data
            'ai': ['Data Science & Analytics', 'Research & Academia'],
            'artificial intelligence': ['Data Science & Analytics', 'Research & Academia'],
            'machine learning': ['Data Science & Analytics', 'Research & Academia'],
            'ml': ['Data Science & Analytics', 'Research & Academia'],
            'data': ['Data Science & Analytics', 'Technical Skills'],
            'analytics': ['Data Science & Analytics', 'Career Development'],
            'science': ['Research & Academia', 'Data Science & Analytics'],
            
            // Business & Entrepreneurship
            'startup': ['Entrepreneurship', 'Product Management'],
            'business': ['Entrepreneurship', 'Career Development'],
            'entrepreneur': ['Entrepreneurship', 'Leadership & Management'],
            'company': ['Entrepreneurship', 'Career Development'],
            'found': ['Entrepreneurship'],
            'innovate': ['Entrepreneurship', 'Product Management'],
            'product': ['Product Management', 'Career Development'],
            
            // Research & Academia
            'research': ['Research & Academia', 'Graduate School Applications'],
            'phd': ['Research & Academia', 'Graduate School Applications'],
            'graduate': ['Graduate School Applications', 'Research & Academia'],
            'academic': ['Research & Academia'],
            'professor': ['Research & Academia'],
            'paper': ['Research & Academia'],
            'study': ['Research & Academia', 'Graduate School Applications'],
            
            // Leadership & Management
            'lead': ['Leadership & Management', 'Career Development'],
            'manage': ['Leadership & Management', 'Product Management'],
            'team': ['Leadership & Management', 'Career Development'],
            'executive': ['Leadership & Management', 'Career Development'],
            
            // Career & Skills
            'career': ['Career Development', 'Networking'],
            'job': ['Career Development', 'Networking'],
            'skill': ['Technical Skills', 'Career Development'],
            'learn': ['Technical Skills', 'Career Development'],
            'network': ['Networking', 'Career Development'],
            'interview': ['Career Development', 'Networking'],
            
            // Healthcare & Medicine
            'health': ['Healthcare', 'Research & Academia'],
            'medical': ['Healthcare', 'Research & Academia'],
            'medicine': ['Healthcare', 'Graduate School Applications'],
            'hospital': ['Healthcare'],
            
            // Environmental & Social
            'environment': ['Environmental Sustainability', 'Research & Academia'],
            'sustainability': ['Environmental Sustainability', 'Entrepreneurship'],
            'green': ['Environmental Sustainability'],
            'climate': ['Environmental Sustainability', 'Research & Academia'],
            'social': ['Social Impact', 'Entrepreneurship'],
            'impact': ['Social Impact', 'Entrepreneurship'],
            'nonprofit': ['Social Impact', 'Entrepreneurship'],
            'community': ['Social Impact', 'Networking'],
            
            // Finance
            'finance': ['Finance & Investment', 'Data Science & Analytics'],
            'investment': ['Finance & Investment'],
            'fintech': ['Finance & Investment', 'Software Development'],
            'banking': ['Finance & Investment', 'Career Development'],
            
            // Creative & Design
            'design': ['Product Management', 'Technical Skills'],
            'creative': ['Product Management', 'Entrepreneurship'],
            'ux': ['Product Management', 'Technical Skills'],
            'ui': ['Product Management', 'Technical Skills']
        };
    }

    _load(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (e) {
            return [];
        }
    }

    _store(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* storage blocked (private mode) - keep in memory only */
        }
    }

    /**
     * Calculate match score between a student and mentor
     * Uses weighted semantic matching
     * 
     * @param {Object} student - Student profile
     * @param {Object} mentor - Mentor profile
     * @returns {Object} Match result with score and details
     */
    calculateMatchScore(student, mentor) {
        let score = 0;
        let details = [];
        let breakdown = {};

        // 1. Passion Analysis (40 points)
        const passionScore = this.calculatePassionMatch(student, mentor);
        if (passionScore.score > 0) {
            score += passionScore.score;
            breakdown.passion = passionScore.score;
            details.push(`Passion alignment: ${passionScore.matchedAreas.join(', ')}`);
        } else {
            breakdown.passion = 0;
        }

        // 2. Major Match (30 points)
        const majorScore = this.calculateMajorMatch(student, mentor);
        if (majorScore > 0) {
            score += majorScore;
            breakdown.major = majorScore;
            details.push('Major aligned');
        } else {
            breakdown.major = 0;
        }

        // 3. Mentorship Style Compatibility (15 points)
        const styleScore = this.calculateStyleMatch(student, mentor);
        if (styleScore > 0) {
            score += styleScore;
            breakdown.style = styleScore;
            details.push('Mentorship style compatible');
        } else {
            breakdown.style = 0;
        }

        // 4. Availability Match (10 points) - Frequency + Days
        const availabilityScore = this.calculateAvailabilityMatch(student, mentor);
        if (availabilityScore.score > 0) {
            score += availabilityScore.score;
            breakdown.availability = availabilityScore.score;
            if (availabilityScore.frequencyMatch && availabilityScore.daysMatch > 0) {
                details.push(`Available ${availabilityScore.daysMatch} same day(s)`);
            } else if (availabilityScore.frequencyMatch) {
                details.push('Meeting frequency aligned');
            } else if (availabilityScore.daysMatch > 0) {
                details.push(`Available ${availabilityScore.daysMatch} same day(s)`);
            }
        } else {
            breakdown.availability = 0;
        }

        // The weights add up to 95 (40 + 30 + 15 + 10), so divide by the real
        // maximum - otherwise a perfect match could only ever show 95%.
        const maxScore = Object.values(this.weights).reduce((a, b) => a + b, 0);

        return {
            score: score,
            maxScore: maxScore,
            percentage: Math.round((score / maxScore) * 100),
            details: details,
            breakdown: breakdown
        };
    }

    /**
     * Analyze passion text using semantic keyword matching
     * Extracts concepts from student's passion description and matches to mentor expertise
     * 
     * @param {Object} student - Student profile
     * @param {Object} mentor - Mentor profile
     * @returns {Object} Score and matched areas
     */
    calculatePassionMatch(student, mentor) {
        if (!student.passion || student.passion.trim() === '') {
            return { score: 0, matchedAreas: [] };
        }

        // Normalize passion text to lowercase
        const passionText = student.passion.toLowerCase();
        
        // Extract potential expertise areas from passion text
        const extractedAreas = new Set();
        
        // Match keywords in passion text to expertise areas.
        // Whole-word match at the start (so "ai" doesn't fire on "maintain" and
        // "ml" doesn't fire on "html"), but allow suffixes ("coding", "builds",
        // "researcher"). Short keywords (<= 3 chars) must match exactly.
        for (const [keyword, areas] of Object.entries(this.passionKeywords)) {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = keyword.length <= 3
                ? new RegExp(`\\b${escaped}\\b`)
                : new RegExp(`\\b${escaped}`);
            if (pattern.test(passionText)) {
                areas.forEach(area => extractedAreas.add(area));
            }
        }

        // Count matches with mentor's expertise
        const matchedAreas = [];
        let matchCount = 0;
        
        if (mentor.expertise) {
            mentor.expertise.forEach(expertise => {
                if (extractedAreas.has(expertise)) {
                    matchedAreas.push(expertise);
                    matchCount++;
                }
            });
        }

        // Calculate score based on number of matches
        // More matches = higher score (capped at max weight)
        if (matchCount === 0) {
            return { score: 0, matchedAreas: [] };
        } else if (matchCount === 1) {
            return { score: this.weights.passion * 0.5, matchedAreas }; // 20 points
        } else if (matchCount === 2) {
            return { score: this.weights.passion * 0.75, matchedAreas }; // 30 points
        } else {
            return { score: this.weights.passion, matchedAreas }; // 40 points (max)
        }
    }

    /**
     * Check if student's major matches mentor's preferred majors
     */
    calculateMajorMatch(student, mentor) {
        if (!mentor.preferredMajors) return 0;
        
        if (mentor.preferredMajors.includes(student.major) ||
            mentor.preferredMajors.includes('Any')) {
            return this.weights.major;
        }
        // "Engineering (Other)" covers any engineering major not listed separately
        if (mentor.preferredMajors.includes('Engineering') &&
            /Engineering/.test(student.major || '')) {
            return this.weights.major;
        }
        return 0;
    }

    /**
     * Check mentorship style compatibility
     */
    calculateStyleMatch(student, mentor) {
        if (!student.mentorStyle || !mentor.mentorshipStyle) return 0;
        
        if (student.mentorStyle === mentor.mentorshipStyle ||
            String(mentor.mentorshipStyle).startsWith('Adaptable') ||
            student.mentorStyle === 'Open to any') {
            return this.weights.style;
        }
        
        return 0;
    }

    /**
     * Check meeting frequency compatibility
     */
    calculateMeetingMatch(student, mentor) {
        if (!student.meetingPreference || !mentor.availability) return 0;
        
        if (student.meetingPreference === mentor.availability ||
            student.meetingPreference === 'As needed') {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate comprehensive availability match
     * Considers both meeting frequency and available days
     * 
     * @param {Object} student - Student profile
     * @param {Object} mentor - Mentor profile
     * @returns {Object} Score and match details
     */
    calculateAvailabilityMatch(student, mentor) {
        const result = {
            score: 0,
            frequencyMatch: false,
            daysMatch: 0
        };

        // Check frequency match (part 1)
        const frequencyMatch = this.calculateMeetingMatch(student, mentor);
        if (frequencyMatch) {
            result.frequencyMatch = true;
        }

        // Check day overlap (part 2)
        const studentDays = student.availableDays || [];
        const mentorDays = mentor.availableDays || [];
        
        if (studentDays.length > 0 && mentorDays.length > 0) {
            // Both have specified days - count overlaps
            const overlappingDays = studentDays.filter(day => mentorDays.includes(day));
            result.daysMatch = overlappingDays.length;
        } else if (studentDays.length === 0 && mentorDays.length === 0) {
            // Neither specified days - give benefit of doubt
            result.daysMatch = 0; // No bonus, but not penalized
        }
        // If only one specified days, no day match points

        // Calculate score
        // Split the 10 points: 3 for frequency, 7 for days
        let score = 0;
        
        // Frequency match: 0 or 3 points
        if (result.frequencyMatch) {
            score += 3;
        }
        
        // Day match: 0-7 points based on overlap
        if (result.daysMatch > 0) {
            // Scale: 1 day = 3.5pts, 2+ days = 7pts (max)
            score += Math.min(7, result.daysMatch * 3.5);
        }

        result.score = Math.min(score, this.weights.availability);
        
        return result;
    }

    /**
     * Find all matches for a student, sorted by compatibility
     * @param {Object} student - Student profile
     * @param {number} limit - Maximum number of matches to return
     * @returns {Array} Sorted array of matches
     */
    findMatches(student, limit = 5) {
        const matches = this.mentors.map(mentor => ({
            mentor: mentor,
            match: this.calculateMatchScore(student, mentor)
        }));

        // Sort by score (highest first)
        matches.sort((a, b) => b.match.score - a.match.score);

        return matches.slice(0, limit);
    }

    /**
     * Save a student profile
     */
    saveStudent(student) {
        student.id = Date.now();
        student.timestamp = new Date().toISOString();
        this.students.push(student);
        this._store('students', this.students);
        this.currentUser = student;
        return student;
    }

    /**
     * Save a mentor profile
     */
    saveMentor(mentor) {
        mentor.id = Date.now();
        mentor.timestamp = new Date().toISOString();
        this.mentors.push(mentor);
        this._store('mentors', this.mentors);
        return mentor;
    }

    /**
     * Replace in-memory data (used when data comes from the AWS backend)
     */
    setMentors(mentors) {
        this.mentors = Array.isArray(mentors) ? mentors : [];
    }

    setStudents(students) {
        this.students = Array.isArray(students) ? students : [];
    }

    /**
     * Get all mentors
     */
    getAllMentors() {
        return this.mentors;
    }

    /**
     * Get all students
     */
    getAllStudents() {
        return this.students;
    }

    /**
     * Clear all data (for testing)
     */
    clearData() {
        this.students = [];
        this.mentors = [];
        this.currentUser = null;
        this._store('students', []);
        this._store('mentors', []);
    }

    /**
     * Initialize with sample data for demonstration
     */
    initializeSampleData() {
        if (this.mentors.length === 0) {
            const sampleMentors = [
                {
                    id: 1,
                    name: "Dr. Sarah Chen",
                    email: "sarah.chen@techcompany.com",
                    title: "Principal Software Engineer",
                    company: "Tech Giant Inc.",
                    field: "Tech/Software",
                    yearsExperience: "15+ years",
                    expertise: ["Software Development", "Data Science & Analytics", "Career Development", "Leadership & Management"],
                    bio: "Passionate about helping the next generation of engineers. Led multiple teams and projects at Fortune 500 companies.",
                    degree: "PhD",
                    almaMater: "Stanford University",
                    sjsuAlumnus: "No",
                    canHelpWith: ["Career Guidance", "Technical Skills", "Networking", "Interview Preparation", "Resume Review"],
                    menteeCapacity: "3-5",
                    availability: "Bi-weekly",
                    availableDays: ["Monday", "Wednesday", "Friday"],
                    mentorshipStyle: "Adaptable to student needs",
                    preferredMajors: ["Computer Science", "Software Engineering", "Data Science"],
                    motivation: "I believe in giving back to the community and helping students navigate their career paths.",
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    name: "Marcus Rodriguez",
                    email: "marcus.r@startup.io",
                    title: "CTO & Co-Founder",
                    company: "InnovateTech Startup",
                    field: "Tech/Software",
                    yearsExperience: "8-15 years",
                    expertise: ["Entrepreneurship", "Product Management", "Software Development", "Career Development"],
                    bio: "SJSU alum who founded two successful startups. Love helping students interested in entrepreneurship.",
                    degree: "Master's",
                    almaMater: "San Jose State University",
                    sjsuAlumnus: "Yes",
                    canHelpWith: ["Career Guidance", "Networking", "Industry Connections", "Technical Skills"],
                    menteeCapacity: "2",
                    availability: "Weekly",
                    availableDays: ["Tuesday", "Thursday", "Saturday"],
                    mentorshipStyle: "Goal-oriented",
                    preferredMajors: ["Computer Science", "Business Administration", "Any"],
                    motivation: "SJSU gave me my start - I want to help current students succeed.",
                    timestamp: new Date().toISOString()
                },
                {
                    id: 3,
                    name: "Dr. Anita Patel",
                    email: "anita.patel@research.edu",
                    title: "Research Scientist",
                    company: "AI Research Lab",
                    field: "Tech/Software",
                    yearsExperience: "8-15 years",
                    expertise: ["Data Science & Analytics", "Research & Academia", "Graduate School Applications"],
                    bio: "Research focus on machine learning and AI. Published 30+ papers. Happy to guide students interested in research or grad school.",
                    degree: "PhD",
                    almaMater: "MIT",
                    sjsuAlumnus: "No",
                    canHelpWith: ["Research Opportunities", "Graduate School Advice", "Technical Skills", "Career Guidance"],
                    menteeCapacity: "3-5",
                    availability: "Monthly",
                    availableDays: ["Wednesday", "Friday"],
                    mentorshipStyle: "Flexible/Guidance-based",
                    preferredMajors: ["Computer Science", "Data Science", "Computer Engineering"],
                    motivation: "I want to increase diversity in AI/ML research and help students from all backgrounds.",
                    timestamp: new Date().toISOString()
                }
            ];
            
            this.mentors = sampleMentors;
            this._store('mentors', this.mentors);
        }
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatchingSystem;
}
