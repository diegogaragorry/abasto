import { Router } from 'express';
import { listStoresController } from '../controllers/storeController';

const storeRoutes = Router();

storeRoutes.get('/', listStoresController);

export default storeRoutes;
