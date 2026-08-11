import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { sendPasswordResetCode } from './passwordResetEmailService.js';

export const PASSWORD_RESET_PUBLIC_MESSAGE = 'Si el correo existe, enviaremos un codigo de recuperacion.';
const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

export class PasswordResetError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PasswordResetError';
    this.status = status;
  }
}

export const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const isEmailLike = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const generateResetCode = () => {
  const max = 10 ** CODE_LENGTH;
  return String(randomInt(0, max)).padStart(CODE_LENGTH, '0');
};

const buildDefaultDependencies = () => ({
  now: () => new Date(),
  generateCode: generateResetCode,
  hashValue: (value) => bcrypt.hash(value, 10),
  compareValue: (value, hash) => bcrypt.compare(value, hash),
  userRepository: {
    findByEmail: (email) => prisma.user.findUnique({ where: { email } })
  },
  resetCodeRepository: {
    create: (data) => prisma.passwordResetCode.create({ data }),
    findLatestUsableByEmail: (email, now) => prisma.passwordResetCode.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_ATTEMPTS }
      },
      orderBy: { createdAt: 'desc' }
    }),
    markFailedAttempt: (id) => prisma.passwordResetCode.update({
      where: { id },
      data: { attempts: { increment: 1 } }
    }),
    complete: ({ userId, resetCodeId, passwordHash, usedAt }) => prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: passwordHash,
          mustChangePassword: false,
          passwordChangedAt: usedAt,
          sessionVersion: { increment: 1 }
        }
      }),
      prisma.passwordResetCode.update({
        where: { id: resetCodeId },
        data: { usedAt }
      })
    ])
  },
  mailer: {
    sendPasswordResetCode
  }
});

export const requestPasswordReset = async ({ email }, dependencies = buildDefaultDependencies()) => {
  const normalizedEmail = normalizeEmail(email);
  if (!isEmailLike(normalizedEmail)) {
    throw new PasswordResetError('Correo electronico invalido');
  }

  const user = await dependencies.userRepository.findByEmail(normalizedEmail);
  if (!user) {
    return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
  }

  const code = dependencies.generateCode();
  const codeHash = await dependencies.hashValue(code);
  const now = dependencies.now();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  await dependencies.resetCodeRepository.create({
    userId: user.id,
    email: normalizedEmail,
    codeHash,
    expiresAt
  });

  await dependencies.mailer.sendPasswordResetCode({
    to: normalizedEmail,
    code,
    expiresInMinutes: CODE_TTL_MINUTES
  });

  return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
};

export const completePasswordReset = async (
  { email, code, newPassword },
  dependencies = buildDefaultDependencies()
) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || '').trim();

  if (!isEmailLike(normalizedEmail)) {
    throw new PasswordResetError('Correo electronico invalido');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new PasswordResetError('Codigo invalido o expirado');
  }

  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new PasswordResetError(`La nueva contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  const now = dependencies.now();
  const resetCode = await dependencies.resetCodeRepository.findLatestUsableByEmail(normalizedEmail, now);
  if (!resetCode) {
    throw new PasswordResetError('Codigo invalido o expirado');
  }

  const isCodeValid = await dependencies.compareValue(normalizedCode, resetCode.codeHash);
  if (!isCodeValid) {
    await dependencies.resetCodeRepository.markFailedAttempt(resetCode.id);
    throw new PasswordResetError('Codigo invalido o expirado');
  }

  const user = await dependencies.userRepository.findByEmail(normalizedEmail);
  if (!user) {
    throw new PasswordResetError('Codigo invalido o expirado');
  }

  const isSamePassword = await dependencies.compareValue(newPassword, user.password);
  if (isSamePassword) {
    throw new PasswordResetError('La nueva contrasena debe ser diferente a la actual');
  }

  const passwordHash = await dependencies.hashValue(newPassword);
  await dependencies.resetCodeRepository.complete({
    userId: user.id,
    resetCodeId: resetCode.id,
    passwordHash,
    usedAt: now
  });

  return { success: true };
};
