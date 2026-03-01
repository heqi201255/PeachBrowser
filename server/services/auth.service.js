const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userRepo = require('../repositories/user.repo');
const { AppError } = require('../middleware/errors');

async function register(username, password) {
  if (!username || !password) {
    throw new AppError('Username and password required', 400, 'VALIDATION_ERROR');
  }
  
  if (username.length < 3 || password.length < 4) {
    throw new AppError('Username must be at least 3 characters, password at least 4', 400, 'VALIDATION_ERROR');
  }
  
  const existing = userRepo.findByUsername(username);
  if (existing) {
    throw new AppError('Username already exists', 400, 'USER_EXISTS');
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  const user = userRepo.create(username, passwordHash);
  
  const token = generateToken(user.id, user.username);
  
  return { token, userId: user.id, username: user.username };
}

async function login(username, password) {
  if (!username || !password) {
    throw new AppError('Username and password required', 400, 'VALIDATION_ERROR');
  }
  
  const user = userRepo.findByUsername(username);
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  
  const securityConfig = config.getConfig().security || {};
  
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new AppError(`Account locked. Try again in ${remaining} minutes.`, 401, 'ACCOUNT_LOCKED');
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const attempts = (user.login_attempts || 0) + 1;
    userRepo.updateLoginAttempts(user.id, attempts);
    
    if (attempts >= (securityConfig.maxLoginAttempts || 5)) {
      const lockoutDuration = securityConfig.lockoutDuration || 15 * 60 * 1000;
      const lockedUntil = new Date(Date.now() + lockoutDuration);
      userRepo.lockAccount(user.id, lockedUntil);
      throw new AppError('Too many failed attempts. Account locked.', 401, 'ACCOUNT_LOCKED');
    }
    
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  
  userRepo.updateLoginAttempts(user.id, 0);
  userRepo.updateLastLogin(user.id);
  
  const token = generateToken(user.id, user.username);
  
  return { 
    token, 
    userId: user.id, 
    username: user.username,
    mustChangePassword: user.must_change_password === 1
  };
}

async function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) {
    throw new AppError('Old password and new password required', 400, 'VALIDATION_ERROR');
  }
  
  if (newPassword.length < 4) {
    throw new AppError('New password must be at least 4 characters', 400, 'VALIDATION_ERROR');
  }
  
  const user = userRepo.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  if (user.must_change_password !== 1) {
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid old password', 401, 'INVALID_CREDENTIALS');
    }
  } else {
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid password', 401, 'INVALID_CREDENTIALS');
    }
  }
  
  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  userRepo.updatePassword(userId, newPasswordHash);
  userRepo.clearMustChangePassword(userId);
  
  return { success: true, message: 'Password changed successfully' };
}

async function ensureAdminUser() {
  const admin = userRepo.findByUsername('admin');
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin', 10);
    const user = userRepo.create('admin', passwordHash, true);
    userRepo.setMustChangePassword(user.id);
    console.log('\n[SECURITY NOTICE] Default admin account created (admin/admin)');
    console.log('[SECURITY NOTICE] Please change the default password immediately!\n');
  } else if (!admin.must_change_password) {
    const isDefaultPassword = await bcrypt.compare('admin', admin.password_hash);
    if (isDefaultPassword) {
      userRepo.setMustChangePassword(admin.id);
      console.log('\n[SECURITY NOTICE] Admin account using default password. Password change required.\n');
    }
  }
}

function generateToken(userId, username) {
  return jwt.sign(
    { userId, username },
    config.getConfig().jwt.secret,
    { expiresIn: config.getConfig().jwt.expiresIn }
  );
}

function getUser(userId) {
  return userRepo.findById(userId);
}

function getAllUsers() {
  return userRepo.findAll();
}

function deleteUser(userId, requesterId) {
  const targetUser = userRepo.findById(userId);
  if (!targetUser) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  if (targetUser.is_admin) {
    throw new AppError('Cannot delete admin user', 400, 'CANNOT_DELETE_ADMIN');
  }
  
  if (userId === requesterId) {
    throw new AppError('Cannot delete yourself', 400, 'CANNOT_DELETE_SELF');
  }
  
  userRepo.deleteById(userId);
  return { success: true };
}

module.exports = {
  register,
  login,
  changePassword,
  ensureAdminUser,
  getUser,
  getAllUsers,
  deleteUser
};