import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createStore } from './store.js';
import { createPostgresStore } from './postgres-store.js';

const priorities = ['Low', 'Medium', 'High', 'Urgent'];
const statuses = ['Requested', 'In progress', 'Scheduled', 'Completed'];
const roomNumbers = Array.from({ length: 8 }, (_value, index) => String(index + 1).padStart(2, '0'));
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 3 * 1024 * 1024;
const seedAccounts = [
  { id: 'USR-ADMIN-001', email: 'admin@campuscare.test', password: 'Admin123!', name: 'Angelo Pascual', role: 'admin' },
  { id: 'USR-STUDENT-001', email: 'student@campuscare.test', password: 'Student123!', name: 'Alex Student', role: 'student' },
  { id: 'USR-STAFF-001', email: 'staff@campuscare.test', password: 'Staff123!', name: 'Lanz Macapagal', role: 'staff' },
];

export function createApp({ store } = {}) {
  store ??= process.env.DATABASE_URL || process.env.USE_POSTGRES === 'true'
    ? createPostgresStore({ connectionString: process.env.DATABASE_URL })
    : createStore();
  const app = express();
  const sessions = new Map();
  app.use(express.json({ limit: '14mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'ua-campus-maintenance-api' });
  });

  app.post('/api/auth/register', async (request, response, next) => {
    try {
      const { name, email, password } = request.body ?? {};
      const validationError = validateAccountFields(name, email, password);
      if (validationError) return response.status(400).json({ message: validationError });
      const data = await ensureUsers(store);
      const normalizedEmail = normalizeEmail(email);
      if (data.users.some((user) => user.email === normalizedEmail)) {
        return response.status(409).json({ message: 'An account already uses that email address.' });
      }
      const user = createUser({ name, email: normalizedEmail, password, role: 'student' });
      data.users.push(user);
      await store.write(data);
      return response.status(201).json(createSession(user, sessions));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const data = await ensureUsers(store);
      const email = normalizeEmail(request.body?.email);
      const user = data.users.find((account) => account.email === email);
      if (!user || !verifyPassword(request.body?.password, user.passwordHash)) {
        return response.status(401).json({ message: 'Email or password is incorrect.' });
      }
      return response.json(createSession(user, sessions));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) sessions.delete(token);
    response.status(204).end();
  });

  app.use('/api', (request, response, next) => {
    const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
    const user = token && sessions.get(token);
    if (!user) return response.status(401).json({ message: 'Please sign in to access CampusCare.' });
    request.user = user;
    request.sessionToken = token;
    return next();
  });

  app.get('/api/account', async (request, response, next) => {
    try {
      const data = await ensureUsers(store);
      const user = data.users.find((account) => account.id === request.user.id);
      if (!user) return response.status(404).json({ message: 'Account not found.' });
      return response.json(publicUser(user));
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/account', async (request, response, next) => {
    try {
      const body = request.body ?? {};
      const allowedFields = ['name', 'currentPassword', 'newPassword'];
      if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
        return response.status(400).json({ message: 'Email and account type cannot be changed here.' });
      }
      if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80)) {
        return response.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
      }
      if (body.newPassword !== undefined && (typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128)) {
        return response.status(400).json({ message: 'New password must be between 8 and 128 characters.' });
      }
      if (body.name === undefined && body.newPassword === undefined) {
        return response.status(400).json({ message: 'Enter a new name or password to save changes.' });
      }

      const data = await ensureUsers(store);
      const user = data.users.find((account) => account.id === request.user.id);
      if (!user) return response.status(404).json({ message: 'Account not found.' });
      if (body.newPassword !== undefined && !verifyPassword(body.currentPassword, user.passwordHash)) {
        return response.status(401).json({ message: 'Current password is incorrect.' });
      }

      const previousName = user.name;
      if (body.name !== undefined) user.name = body.name.trim();
      if (body.newPassword !== undefined) user.passwordHash = hashPassword(body.newPassword);
      if (user.name !== previousName) {
        for (const order of data.workOrders) {
          if (order.reportedBy === previousName) order.reportedBy = user.name;
          if (order.assignedTo === previousName) order.assignedTo = user.name;
        }
        for (const staffMember of data.staff) {
          if (staffMember.name === previousName) staffMember.name = user.name;
        }
      }
      await store.write(data);
      const updatedUser = publicUser(user);
      for (const [token, sessionUser] of sessions) {
        if (sessionUser.id === user.id) sessions.set(token, updatedUser);
      }
      return response.json(updatedUser);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/users', async (request, response, next) => {
    try {
      if (request.user.role !== 'admin') {
        return response.status(403).json({ message: 'Only administrators can view accounts.' });
      }
      const data = await ensureUsers(store);
      return response.json(data.users.map(publicUser));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/users/staff', async (request, response, next) => {
    try {
      if (request.user.role !== 'admin') {
        return response.status(403).json({ message: 'Only administrators can create maintenance staff accounts.' });
      }
      const { name, email, password } = request.body ?? {};
      const validationError = validateAccountFields(name, email, password);
      if (validationError) return response.status(400).json({ message: validationError });
      const data = await ensureUsers(store);
      const normalizedEmail = normalizeEmail(email);
      if (data.users.some((user) => user.email === normalizedEmail)) {
        return response.status(409).json({ message: 'An account already uses that email address.' });
      }
      const user = createUser({ name, email: normalizedEmail, password, role: 'staff' });
      data.users.push(user);
      await store.write(data);
      return response.status(201).json(publicUser(user));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/overview', async (_request, response, next) => {
    try {
      const data = await store.read();
      const visibleOrders = visibleWorkOrders(data.workOrders, _request.user);
      const openOrders = visibleOrders.filter((order) => order.status !== 'Completed');
      const today = new Date().toISOString().slice(0, 10);
      response.json({
        openOrders: openOrders.length,
        inProgress: visibleOrders.filter((order) => order.status === 'In progress').length,
        overdue: openOrders.filter((order) => order.dueAt < today).length,
        scheduledToday: visibleOrders.filter((order) => order.status === 'Scheduled' && order.dueAt === today).length,
        activeEquipment: data.equipment.filter((item) => item.condition !== 'Out of service').length,
        workOrders: visibleOrders.slice(0, 5),
        facilities: data.facilities,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/work-orders', async (_request, response, next) => {
    try {
      const data = await store.read();
      response.json(visibleWorkOrders(data.workOrders, _request.user));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/work-orders', async (request, response, next) => {
    try {
      const { title, facility, category, floor, roomNumber, priority = 'Medium', assignedTo = 'Unassigned', description = '' } = request.body;
      if (!title?.trim() || !facility?.trim() || !category?.trim() || !floor || !roomNumber) {
        return response.status(400).json({ message: 'Title, facility, category, floor, and room number are required.' });
      }
      if (!priorities.includes(priority)) {
        return response.status(400).json({ message: 'Choose a valid priority.' });
      }
      if (![1, 2, 3].includes(Number(floor)) || !roomNumbers.includes(roomNumber)) {
        return response.status(400).json({ message: 'Choose a floor from 1 to 3 and a room number from 01 to 08.' });
      }
      const imageResult = validateImages(request.body.images);
      if (imageResult.error) return response.status(400).json({ message: imageResult.error });

      const data = await store.read();
      const workOrder = {
        id: `WO-${Date.now().toString().slice(-6)}`,
        title: title.trim(),
        facility: facility.trim(),
        category: category.trim(),
        priority,
        status: 'Requested',
        assignedTo,
        floor: Number(floor),
        roomNumber,
        reportedBy: request.user.name,
        createdAt: new Date().toISOString().slice(0, 10),
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        description: description.trim(),
        images: imageResult.images,
      };
      data.workOrders.unshift(workOrder);
      await store.write(data);
      return response.status(201).json(workOrder);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/work-orders/:id/accept', async (request, response, next) => {
    try {
      if (request.user.role !== 'staff') {
        return response.status(403).json({ message: 'Only maintenance staff can accept an unassigned request.' });
      }
      const data = await store.read();
      const workOrder = data.workOrders.find((order) => order.id === request.params.id);
      if (!workOrder) return response.status(404).json({ message: 'Work order not found.' });
      if (workOrder.assignedTo !== 'Unassigned' || workOrder.status === 'Completed') {
        return response.status(409).json({ message: 'This request is no longer available to accept.' });
      }
      workOrder.assignedTo = request.user.name;
      await store.write(data);
      return response.json(workOrder);
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/work-orders/:id', async (request, response, next) => {
    try {
      const data = await store.read();
      const workOrder = data.workOrders.find((order) => order.id === request.params.id);
      if (!workOrder) {
        return response.status(404).json({ message: 'Work order not found.' });
      }
      if (request.user.role === 'student') {
        return response.status(403).json({ message: 'Student accounts cannot update work orders.' });
      }
      if (request.user.role === 'staff' && workOrder.assignedTo !== request.user.name) {
        return response.status(403).json({ message: 'Staff accounts can only update their assigned work orders.' });
      }
      if (request.user.role === 'staff' && Object.keys(request.body).some((field) => field !== 'status')) {
        return response.status(403).json({ message: 'Staff accounts can only update work order status.' });
      }
      if ('status' in request.body && !statuses.includes(request.body.status)) {
        return response.status(400).json({ message: 'Choose a valid status.' });
      }
      if ('priority' in request.body && !priorities.includes(request.body.priority)) {
        return response.status(400).json({ message: 'Choose a valid priority.' });
      }
      if ('floor' in request.body && ![1, 2, 3].includes(Number(request.body.floor))) {
        return response.status(400).json({ message: 'Choose a floor from 1 to 3.' });
      }
      if ('roomNumber' in request.body && !roomNumbers.includes(request.body.roomNumber)) {
        return response.status(400).json({ message: 'Choose a room number from 01 to 08.' });
      }

      const allowedFields = ['status', 'priority', 'assignedTo', 'dueAt', 'description', 'floor', 'roomNumber'];
      for (const field of allowedFields) {
        if (field in request.body) {
          workOrder[field] = field === 'floor' ? Number(request.body[field]) : request.body[field];
        }
      }
      if (workOrder.status === 'Completed') {
        workOrder.completedAt = new Date().toISOString().slice(0, 10);
      }
      await store.write(data);
      return response.json(workOrder);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/work-orders/:id', async (request, response, next) => {
    try {
      if (!['staff', 'admin'].includes(request.user.role)) {
        return response.status(403).json({ message: 'Only maintenance staff or administrators can delete work requests.' });
      }
      const data = await store.read();
      const index = data.workOrders.findIndex((order) => order.id === request.params.id);
      if (index === -1) return response.status(404).json({ message: 'Work order not found.' });
      const workOrder = data.workOrders[index];
      if (request.user.role === 'staff' && workOrder.assignedTo !== request.user.name && workOrder.assignedTo !== 'Unassigned') {
        return response.status(403).json({ message: 'Staff accounts can only delete unassigned or assigned work requests.' });
      }
      data.workOrders.splice(index, 1);
      await store.write(data);
      return response.status(200).json({ id: workOrder.id, deleted: true });
    } catch (error) {
      return next(error);
    }
  });

  for (const resource of ['facilities', 'equipment', 'staff', 'inventory']) {
    app.get(`/api/${resource}`, async (_request, response, next) => {
      try {
        if (_request.user.role === 'student' && resource !== 'facilities') {
          return response.status(403).json({ message: 'This resource is only available to campus operations accounts.' });
        }
        const data = await store.read();
        response.json(data[resource]);
      } catch (error) {
        next(error);
      }
    });
  }

  if (process.env.NODE_ENV === 'production') {
    const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
    app.use(express.static(frontendDir));
    app.get('*', (request, response, next) => {
      if (request.path.startsWith('/api/')) return next();
      return response.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  app.use((error, _request, response, _next) => {
    console.error(error);
    const status = error.status === 413 ? 413 : 500;
    response.status(status).json({ message: status === 413 ? 'Request body is too large.' : 'Something went wrong while processing the request.' });
  });

  return app;
}

function visibleWorkOrders(workOrders, user) {
  if (user.role === 'student') return workOrders.filter((order) => order.reportedBy === user.name);
  if (user.role === 'staff') {
    return workOrders.filter((order) => order.assignedTo === user.name || (order.assignedTo === 'Unassigned' && order.status !== 'Completed'));
  }
  return workOrders;
}

function validateImages(images) {
  if (images === undefined) return { images: [] };
  if (!Array.isArray(images) || images.length > 3) {
    return { error: 'Attach up to 3 images per request.' };
  }

  const validatedImages = [];
  for (const image of images) {
    if (!imageTypes.has(image?.type) || typeof image.name !== 'string' || typeof image.data !== 'string') {
      return { error: 'Attachments must be PNG, JPEG, or WebP images.' };
    }
    const prefix = `data:${image.type};base64,`;
    if (!image.data.startsWith(prefix)) return { error: 'An image attachment could not be read.' };
    const encoded = image.data.slice(prefix.length);
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      return { error: 'An image attachment could not be read.' };
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > maxImageBytes) return { error: 'Each image must be 3 MB or smaller.' };
    if (!matchesImageType(buffer, image.type)) return { error: 'An attachment does not match its image type.' };
    validatedImages.push({
      name: image.name.trim().slice(0, 120) || 'equipment-image',
      type: image.type,
      data: image.data,
    });
  }
  return { images: validatedImages };
}

function matchesImageType(buffer, type) {
  if (type === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = process.env.PORT || 4000;
  createApp().listen(port, () => console.log(`CampusCare API listening on http://localhost:${port}`));
}

async function ensureUsers(store) {
  const data = await store.read();
  if (!Array.isArray(data.users)) {
    data.users = seedAccounts.map((account) => createUser(account));
    await store.write(data);
  }
  return data;
}

function createUser({ id = `USR-${randomBytes(5).toString('hex').toUpperCase()}`, name, email, password, role }) {
  return { id, name: name.trim(), email: normalizeEmail(email), role, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function createSession(user, sessions) {
  const token = randomBytes(32).toString('hex');
  const account = publicUser(user);
  sessions.set(token, account);
  return { token, user: account };
}

function publicUser({ id, name, email, role, createdAt }) {
  return { id, name, email, role, createdAt };
}

function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false;
  const [salt, encodedHash] = passwordHash.split(':');
  if (!salt || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(encodedHash ?? '')) return false;
  const expected = Buffer.from(encodedHash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function validateAccountFields(name, email, password) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return 'Enter a name between 2 and 80 characters.';
  }
  if (typeof email !== 'string' || email.trim().length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }
  return '';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}