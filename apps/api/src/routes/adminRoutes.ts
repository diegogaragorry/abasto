import { Router } from 'express';
import multer from 'multer';
import {
  getPedidosYaSessionController,
  listBatchHistoryController,
  syncDiscoPricesController,
  syncPedidosYaPricesController,
  syncTataPricesController,
  updatePedidosYaSessionController,
  uploadFeriaPdfController
} from '../controllers/adminController';
import { createProductController, deleteProductController, updateProductController } from '../controllers/productController';
import { updateStoreController } from '../controllers/storeController';

const upload = multer();
const adminRoutes = Router();

adminRoutes.get('/batches', listBatchHistoryController);
adminRoutes.get('/pedidosya/session', getPedidosYaSessionController);
adminRoutes.post('/feria/upload', upload.single('file'), uploadFeriaPdfController);
adminRoutes.post('/disco/sync', syncDiscoPricesController);
adminRoutes.post('/tata/sync', syncTataPricesController);
adminRoutes.post('/pedidosya/sync', syncPedidosYaPricesController);
adminRoutes.post('/pedidosya/session', updatePedidosYaSessionController);
adminRoutes.post('/products', createProductController);
adminRoutes.patch('/products/:id', updateProductController);
adminRoutes.delete('/products/:id', deleteProductController);
adminRoutes.patch('/stores/:id', updateStoreController);

export default adminRoutes;
