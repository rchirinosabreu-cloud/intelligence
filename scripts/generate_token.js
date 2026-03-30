import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'brainstudio-secret-key-2025';

const user = {
    userId: 'admin-id', // Match the ID in the mock/seed if possible, or just any UUID
    name: 'Rodny Admin',
    email: 'admin@brainstudio.com',
    role: 'ADMIN'
};

const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
console.log(token);
