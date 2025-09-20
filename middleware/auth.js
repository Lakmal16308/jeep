import jwt from 'jsonwebtoken';

// Validate JWT_SECRET at startup
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Middleware to authenticate JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(`[${new Date().toISOString()}] Authenticating request for ${req.method} ${req.path}, Authorization header: ${authHeader || 'none'}`);
  
  // Check for token presence and correct format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error(`[${new Date().toISOString()}] No valid Bearer token provided for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'No valid Bearer token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.error(`[${new Date().toISOString()}] Token missing after Bearer prefix for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Token missing' });
  }

  console.log(`[${new Date().toISOString()}] Verifying token for ${req.method} ${req.path}: ${token.substring(0, 20)}...`);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate role
    const validRoles = ['admin', 'tourist', 'provider'];
    if (!decoded.id || !decoded.role || !validRoles.includes(decoded.role)) {
      console.error(`[${new Date().toISOString()}] Invalid token payload for ${req.method} ${req.path}:`, decoded);
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    console.log(`[${new Date().toISOString()}] Token verified for ${req.method} ${req.path}, user:`, {
      id: decoded.id,
      role: decoded.role
    });
    
    req.user = decoded;
    
    // Add security headers
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    
    next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Token verification failed for ${req.method} ${req.path}:`, err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

// Middleware to check for admin role
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    console.error(`[${new Date().toISOString()}] No user object in request for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    console.error(`[${new Date().toISOString()}] Access denied for ${req.method} ${req.path}, user:`, {
      id: req.user.id,
      role: req.user.role
    });
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  
  console.log(`[${new Date().toISOString()}] Admin access granted for ${req.method} ${req.path}, user:`, {
    id: req.user.id
  });
  
  next();
};