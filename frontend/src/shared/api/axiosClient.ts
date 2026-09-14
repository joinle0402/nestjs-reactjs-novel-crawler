import axios, { type AxiosRequestConfig } from 'axios';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
    timeout: 20000,
});

instance.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error.response?.data ?? error),
);

type ApiClient = {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
};

export const axiosClient = instance as unknown & ApiClient;
