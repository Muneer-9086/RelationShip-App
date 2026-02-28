import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL 


const api = axios.create({
  baseURL:"http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
});


api.interceptors.request.use(
  (config: any) => {
    const token = localStorage.getItem("token");

    console.log("__SERVER_URL__");
    console.log(SERVER_URL);

    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }



    return config;
  },
  (error: AxiosError) => {
    console.error("❌ Request Error:", error);
    return Promise.reject(error);
  }
);


api.interceptors.response.use(
  (response: AxiosResponse) => {
 

    return response; 
  },
  async (error: AxiosError<any>) => {
    console.error(
      `%c⛔ API ERROR`,
      "color: #f87171; font-weight: bold;",
      {
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data,
      }
    );

    // Unauthorized → auto logout
    if (error.response?.status === 401) {
      localStorage.removeItem("token");

      // optional redirect
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

export default api;
