/// <reference types="vite/client" />
import type { RokkoAPI } from '../../shared/model';
declare global { interface Window { rokko: RokkoAPI } }
export {};
