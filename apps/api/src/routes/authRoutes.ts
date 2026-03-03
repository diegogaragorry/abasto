import { Router } from 'express';
import { loginController, logoutController } from '../controllers/authController';

const authRoutes = Router();

authRoutes.post('/login', loginController);
authRoutes.post('/logout', logoutController);

export default authRoutes;
