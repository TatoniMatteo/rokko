/// <reference types="vite/client" />
import type { RokkoAPI } from '../shared/contracts/model';
declare global { interface Window { rokko: RokkoAPI } }
export {};
