import { Router } from 'express';
import { loginController, logoutController, sessionController } from '../controllers/authController';

const authRoutes = Router();

authRoutes.post('/login', loginController);
authRoutes.post('/logout', logoutController);
authRoutes.get('/session', sessionController);

export default authRoutes;
