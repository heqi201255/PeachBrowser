const db = require('../database');

function findById(userId) {
  return db.getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function findByUsername(username) {
  return db.getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function create(username, passwordHash, isAdmin = false) {
  const result = db.getDb().prepare(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
  ).run(username, passwordHash, isAdmin ? 1 : 0);
  return { id: result.lastInsertRowid, username, is_admin: isAdmin };
}

function updatePassword(userId, passwordHash) {
  db.getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

function updateLastLogin(userId) {
  db.getDb().prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(userId);
}

function updateLoginAttempts(userId, attempts) {
  db.getDb().prepare('UPDATE users SET login_attempts = ? WHERE id = ?').run(attempts, userId);
}

function lockAccount(userId, lockedUntil) {
  db.getDb().prepare('UPDATE users SET locked_until = ?, login_attempts = 0 WHERE id = ?').run(lockedUntil.toISOString(), userId);
}

function setMustChangePassword(userId) {
  db.getDb().prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(userId);
}

function clearMustChangePassword(userId) {
  db.getDb().prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(userId);
}

function findAll() {
  const users = db.getDb().prepare(`
    SELECT u.id, u.username, u.is_admin, u.created_at, u.last_login, u.must_change_password,
           GROUP_CONCAT(DISTINCT ul.library_id) as library_ids
    FROM users u
    LEFT JOIN user_libraries ul ON u.id = ul.user_id
    GROUP BY u.id
    ORDER BY u.id
  `).all();
  
  return users.map(u => ({
    ...u,
    library_ids: u.library_ids ? u.library_ids.split(',').map(id => parseInt(id)) : []
  }));
}

function deleteById(userId) {
  db.getDb().prepare('DELETE FROM user_libraries WHERE user_id = ?').run(userId);
  db.getDb().prepare('DELETE FROM play_history WHERE user_id = ?').run(userId);
  db.getDb().prepare('DELETE FROM tags WHERE user_id = ?').run(userId);
  db.getDb().prepare('DELETE FROM media_ratings WHERE user_id = ?').run(userId);
  db.getDb().prepare('DELETE FROM media_likes WHERE user_id = ?').run(userId);
  db.getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
}

module.exports = {
  findById,
  findByUsername,
  create,
  updatePassword,
  updateLastLogin,
  updateLoginAttempts,
  lockAccount,
  setMustChangePassword,
  clearMustChangePassword,
  findAll,
  deleteById
};