import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.js';
import { createStore } from './store.js';

describe('CampusCare API', () => {
  let directory;
  let dataPath;
  let app;
  let adminToken;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'campuscare-test-'));
    dataPath = path.join(directory, 'store.json');
    await writeFile(dataPath, JSON.stringify({
      workOrders: [],
      facilities: [],
      equipment: [],
      staff: [],
      inventory: [],
    }));
    app = createApp({ store: createStore(dataPath) });
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@campuscare.test',
      password: 'Admin123!',
    }).expect(200);
    adminToken = login.body.token;
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  it('returns a healthy API status', async () => {
    const response = await request(app).get('/api/health').expect(200);
    assert.equal(response.body.status, 'ok');
  });

  it('rejects invalid demo credentials', async () => {
    await request(app).post('/api/auth/login').send({
      email: 'student@campuscare.test',
      password: 'wrong-password',
      role: 'student',
    }).expect(401);
  });

  it('lets students register and sign in with a persisted hashed password', async () => {
    const registration = await request(app).post('/api/auth/register').send({
      name: 'Taylor Student',
      email: 'Taylor.Student@example.test',
      password: 'StudentPass123',
    }).expect(201);
    assert.equal(registration.body.user.role, 'student');
    assert.equal(registration.body.user.email, 'taylor.student@example.test');

    await request(app).post('/api/auth/login').send({
      email: 'taylor.student@example.test',
      password: 'StudentPass123',
      role: 'student',
    }).expect(200);
    await request(app).post('/api/auth/register').send({
      name: 'Another Student',
      email: 'TAYLOR.STUDENT@example.test',
      password: 'AnotherPass123',
    }).expect(409);

    const persisted = JSON.parse(await readFile(dataPath, 'utf8'));
    const account = persisted.users.find((user) => user.email === 'taylor.student@example.test');
    assert.equal(account.role, 'student');
    assert.notEqual(account.passwordHash, 'StudentPass123');
    assert.equal('password' in account, false);
  });

  it('allows only administrators to create maintenance staff accounts', async () => {
    const created = await request(app).post('/api/users/staff').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Morgan Technician',
      email: 'morgan.staff@example.test',
      password: 'TechnicianPass123',
    }).expect(201);
    assert.equal(created.body.role, 'staff');
    assert.equal('passwordHash' in created.body, false);

    const accounts = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert(accounts.body.some((user) => user.email === 'morgan.staff@example.test'));

    const studentLogin = await request(app).post('/api/auth/login').send({
      email: 'student@campuscare.test',
      password: 'Student123!',
      role: 'student',
    }).expect(200);
    await request(app).post('/api/users/staff').set('Authorization', `Bearer ${studentLogin.body.token}`).send({
      name: 'Unauthorized Technician',
      email: 'unauthorized.staff@example.test',
      password: 'TechnicianPass123',
    }).expect(403);
    await request(app).get('/api/users').set('Authorization', `Bearer ${studentLogin.body.token}`).expect(403);

    await request(app).post('/api/auth/login').send({
      email: 'morgan.staff@example.test',
      password: 'TechnicianPass123',
      role: 'staff',
    }).expect(200);
  });

  it('lets users update their own name and password without changing email', async () => {
    const workOrder = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Inspect staff assignment',
      facility: 'Ryan Hall',
      category: 'Equipment',
      assignedTo: 'Lanz Macapagal',
      floor: 1,
      roomNumber: '01',
    }).expect(201);
    const staffLogin = await request(app).post('/api/auth/login').send({
      email: 'staff@campuscare.test',
      password: 'Staff123!',
    }).expect(200);
    const authorization = `Bearer ${staffLogin.body.token}`;

    const profile = await request(app).get('/api/account').set('Authorization', authorization).expect(200);
    assert.equal(profile.body.email, 'staff@campuscare.test');
    assert.equal(profile.body.role, 'staff');
    await request(app).patch('/api/account').set('Authorization', authorization)
      .send({ email: 'new-address@example.test' }).expect(400);

    const renamed = await request(app).patch('/api/account').set('Authorization', authorization)
      .send({ name: 'Lanz Macapagal Updated' }).expect(200);
    assert.equal(renamed.body.name, 'Lanz Macapagal Updated');
    assert.equal(renamed.body.email, 'staff@campuscare.test');
    const assignments = await request(app).get('/api/work-orders').set('Authorization', authorization).expect(200);
    assert(assignments.body.some((order) => order.id === workOrder.body.id && order.assignedTo === renamed.body.name));

    await request(app).patch('/api/account').set('Authorization', authorization)
      .send({ currentPassword: 'wrong-password', newPassword: 'NewStaffPass123' }).expect(401);
    await request(app).patch('/api/account').set('Authorization', authorization)
      .send({ name: renamed.body.name, currentPassword: 'Staff123!', newPassword: 'NewStaffPass123' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'staff@campuscare.test', password: 'Staff123!' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'staff@campuscare.test', password: 'NewStaffPass123' }).expect(200);
  });

  it('revokes a session when the user signs out', async () => {
    await request(app).get('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${adminToken}`).expect(204);
    await request(app).get('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).expect(401);
  });

  it('requires a valid session and scopes student work orders', async () => {
    await request(app).get('/api/work-orders').expect(401);
    await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Repair classroom lights',
      facility: 'Ryan Hall',
      category: 'Electrical',
      assignedTo: 'Lanz Macapagal',
      floor: 2,
      roomNumber: '04',
    }).expect(201);

    const studentLogin = await request(app).post('/api/auth/login').send({
      email: 'student@campuscare.test',
      password: 'Student123!',
      role: 'student',
    }).expect(200);
    const studentOrders = await request(app).get('/api/work-orders')
      .set('Authorization', `Bearer ${studentLogin.body.token}`).expect(200);
    assert.equal(studentOrders.body.length, 0);
    const studentRequest = await request(app).post('/api/work-orders')
      .set('Authorization', `Bearer ${studentLogin.body.token}`).send({
        title: 'Report classroom lights',
        facility: 'Ryan Hall',
        category: 'Electrical',
        floor: 1,
        roomNumber: '02',
        images: [{
          name: 'equipment.png',
          type: 'image/png',
          data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jjiAAAAAASUVORK5CYII=',
        }],
      }).expect(201);
    assert.equal(studentRequest.body.reportedBy, 'Alex Student');
    assert.equal(studentRequest.body.images[0].name, 'equipment.png');
    await request(app).post(`/api/work-orders/${studentRequest.body.id}/accept`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`).expect(403);
    const ownRequests = await request(app).get('/api/work-orders')
      .set('Authorization', `Bearer ${studentLogin.body.token}`).expect(200);
    assert.equal(ownRequests.body.length, 1);
    await request(app).patch(`/api/work-orders/${studentRequest.body.id}`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`).send({ status: 'Completed' }).expect(403);
    await request(app).get('/api/inventory')
      .set('Authorization', `Bearer ${studentLogin.body.token}`).expect(403);

    const staffLogin = await request(app).post('/api/auth/login').send({
      email: 'staff@campuscare.test',
      password: 'Staff123!',
      role: 'staff',
    }).expect(200);
    const assignments = await request(app).get('/api/work-orders')
      .set('Authorization', `Bearer ${staffLogin.body.token}`).expect(200);
    assert.equal(assignments.body.length, 2);
    const assignedOrder = assignments.body.find((order) => order.assignedTo === 'Lanz Macapagal');
    const availableOrder = assignments.body.find((order) => order.assignedTo === 'Unassigned');
    assert.equal(availableOrder.images[0].name, 'equipment.png');
    const acceptedOrder = await request(app).post(`/api/work-orders/${availableOrder.id}/accept`)
      .set('Authorization', `Bearer ${staffLogin.body.token}`).expect(200);
    assert.equal(acceptedOrder.body.assignedTo, 'Lanz Macapagal');
    await request(app).post(`/api/work-orders/${availableOrder.id}/accept`)
      .set('Authorization', `Bearer ${staffLogin.body.token}`).expect(409);
    await request(app).patch(`/api/work-orders/${assignedOrder.id}`)
      .set('Authorization', `Bearer ${staffLogin.body.token}`).send({ status: 'In progress' }).expect(200);
    await request(app).patch(`/api/work-orders/${assignedOrder.id}`)
      .set('Authorization', `Bearer ${staffLogin.body.token}`).send({ priority: 'Urgent' }).expect(403);
    await request(app).delete(`/api/work-orders/${studentRequest.body.id}`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`).expect(403);
    await request(app).delete(`/api/work-orders/${assignedOrder.id}`)
      .set('Authorization', `Bearer ${staffLogin.body.token}`).expect(200);
    await request(app).delete('/api/work-orders/WO-MISSING')
      .set('Authorization', `Bearer ${staffLogin.body.token}`).expect(404);
  });

  it('creates work orders and persists them for later retrieval', async () => {
    const created = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Repair classroom lights',
      facility: 'Ryan Hall',
      category: 'Electrical',
      priority: 'High',
      floor: 2,
      roomNumber: '04',
    }).expect(201);

    assert.equal(created.body.title, 'Repair classroom lights');
    assert.equal(created.body.floor, 2);
    assert.equal(created.body.roomNumber, '04');
    const listed = await request(app).get('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(listed.body[0].id, created.body.id);
    const persisted = JSON.parse(await readFile(dataPath, 'utf8'));
    assert.equal(persisted.workOrders.length, 1);
  });

  it('rejects incomplete work order requests', async () => {
    const response = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({ title: 'Repair lights' }).expect(400);
    assert.match(response.body.message, /required/i);
  });

  it('rejects floors and room numbers outside the supported ranges', async () => {
    const response = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Repair classroom lights',
      facility: 'Ryan Hall',
      category: 'Electrical',
      floor: 4,
      roomNumber: '09',
    }).expect(400);
    assert.match(response.body.message, /floor from 1 to 3/i);
  });

  it('rejects unsupported image attachment types', async () => {
    const response = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Inspect equipment',
      facility: 'Ryan Hall',
      category: 'Equipment',
      floor: 1,
      roomNumber: '01',
      images: [{ name: 'image.svg', type: 'image/svg+xml', data: 'data:image/svg+xml;base64,PHN2Zz4=' }],
    }).expect(400);
    assert.match(response.body.message, /PNG, JPEG, or WebP/i);
  });

  it('updates a work order and rejects unknown statuses', async () => {
    const created = await request(app).post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'Repair classroom lights',
      facility: 'Ryan Hall',
      category: 'Electrical',
      floor: 1,
      roomNumber: '01',
    }).expect(201);

    const updated = await request(app).patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'Completed' }).expect(200);
    assert.equal(updated.body.status, 'Completed');
    await request(app).patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'Waiting' }).expect(400);
  });
});