// src/types/express/index.d.ts

import { IUser } from '../../interfaces/models/user'; // Hoặc một interface user tinh gọn hơn

declare global {
  namespace Express {
    export interface Request {
      user?: IUser; // Hoặc kiểu AuthenticatedUser
    }
  }
}