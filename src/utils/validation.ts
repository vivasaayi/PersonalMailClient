// Input validation utilities for security
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
};

export const validateUid = (uid: string): boolean => {
  // UIDs should be alphanumeric with common separators, reasonable length
  const uidRegex = /^[a-zA-Z0-9._-]+$/;
  return uidRegex.test(uid) && uid.length > 0 && uid.length <= 100;
};

export const sanitizeString = (input: string): string => {
  // Basic XSS prevention - remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

export const validateMessageSubject = (subject: string): boolean => {
  return subject.length <= 200 && !/[<>"'&]/.test(subject);
};

export const validateAnalysisPrompt = (prompt: string): boolean => {
  // Limit prompt length and check for potentially harmful content
  if (prompt.length > 2000) return false;

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /eval\(/i,
    /document\./i,
    /window\./i,
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(prompt));
};