import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import basketRoutes from './routes/basketRoutes';
import pedidosYaBrowserSyncRoutes from './routes/pedidosYaBrowserSyncRoutes';
import productRoutes from './routes/productRoutes';
import storeRoutes from './routes/storeRoutes';
import { requireAdminSession } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const cookieSecret = process.env.ADMIN_PASSWORD ?? 'abasto-dev-cookie-secret';
const allowedCorsOrigins = new Set(
  (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

allowedCorsOrigins.add('https://www.pedidosya.com.uy');

app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(cookieSecret));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/pedidosya/browser-sync', pedidosYaBrowserSyncRoutes);
app.use('/admin', requireAdminSession, adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/basket', basketRoutes);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
