import axios from "axios";
import { tokenStorage } from "./token-storage";
import { getTenantId } from "./tenant";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = getTenantId();
  if (tenantId) {
    config.headers["X-Tenant-Id"] = tenantId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenStorage.clear();
    }
    return Promise.reject(error);
  }
);

export const extractErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | {
          message?: string;
          error?: string;
          errors?: Array<{ path?: Array<string | number>; message?: string }>;
        }
      | undefined;

    const baseMessage = responseData?.message ?? responseData?.error ?? error.message;
    const firstIssue = responseData?.errors?.[0];

    if (firstIssue?.message) {
      const path = firstIssue.path?.length ? ` (${firstIssue.path.join(".")})` : "";
      return `${baseMessage}${path}: ${firstIssue.message}`;
    }

    return baseMessage;
  }

  return "Error inesperado";
};
