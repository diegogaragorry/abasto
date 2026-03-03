import { Router } from 'express';
import { listProductPriceHistoryController, listProductsController } from '../controllers/productController';

const productRoutes = Router();

productRoutes.get('/', listProductsController);
productRoutes.get('/:id/prices', listProductPriceHistoryController);

export default productRoutes;
