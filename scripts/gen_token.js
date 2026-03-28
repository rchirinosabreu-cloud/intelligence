
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'brainstudio-secret-key-2025';
const payload = {
    userId: 'admin-id',
    name: 'System Admin',
    email: 'admin@brainstudio.com',
    role: 'ADMIN'
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
console.log(token);
