import { randomUUID } from 'crypto';
import db from '../db.js';

export async function getFeedbackHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
  const isAdmin = user && user.is_admin >= 1;
  const entries = db.prepare('SELECT f.*, u.username, u.email, u.avatar_url FROM feedback f LEFT JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC').all();
  res.json({ entries, isAdmin });
}

export async function createFeedbackHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.length < 1 || content.length > 2000) return res.status(400).json({ error: 'Invalid content' });
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO feedback (id, user_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, req.session.user.id, content, now);
  res.status(201).json({ message: 'Feedback submitted', id });
}

export async function deleteFeedbackHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
  const isAdmin = user && user.is_admin >= 1;
  if (entry.user_id !== req.session.user.id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
  res.json({ message: 'Deleted' });
}