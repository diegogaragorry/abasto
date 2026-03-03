import { Router } from 'express';
import {
  calculateBasketController,
  calculateDefaultBasketController,
  getBasketController,
  upsertBasketController
} from '../controllers/basketController';

const basketRoutes = Router();

basketRoutes.get('/', getBasketController);
basketRoutes.post('/', upsertBasketController);
basketRoutes.get('/calculate', calculateDefaultBasketController);
basketRoutes.get('/:id/calculate', calculateBasketController);

export default basketRoutes;
