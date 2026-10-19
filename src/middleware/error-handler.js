import { ZodError } from 'zod';
import multer from 'multer';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}

export function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (error instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request body.', details: error.issues } });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: error.code === 'LIMIT_FILE_SIZE' ? 'File must not exceed 10 MB.' : 'Invalid file upload.' } });
  }
  const status = error.statusCode ?? 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: status >= 500 ? 'Internal server error.' : error.message } });
}
