/** Client-side checks for auth forms. The server enforces its own rules too. */

export const PASSWORD_MIN = 6

export function validateEmail(email) {
  const e = email.trim()
  if (!e) return 'Enter your email address.'
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'That doesn’t look like a valid email address.'
  return null
}

export function checkPassword(pw) {
  const problems = []
  if (pw.length < PASSWORD_MIN) problems.push(`At least ${PASSWORD_MIN} characters`)
  let score = 0
  if (pw.length >= PASSWORD_MIN) score++
  if (pw.length >= 10) score++
  if (pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  if (problems.length) score = Math.min(score, 1)
  const label = pw.length < PASSWORD_MIN ? 'Too short' : ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][score]
  return { ok: problems.length === 0, score, label, problems }
}
