import { Router } from 'express';
import {
  listPedidosYaBrowserSyncRequestsController,
  persistPedidosYaBrowserSyncWithTokenController
} from '../controllers/adminController';

const pedidosYaBrowserSyncRoutes = Router();

pedidosYaBrowserSyncRoutes.get('/requests', listPedidosYaBrowserSyncRequestsController);
pedidosYaBrowserSyncRoutes.post('/results', persistPedidosYaBrowserSyncWithTokenController);

export default pedidosYaBrowserSyncRoutes;
