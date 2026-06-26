import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { api, extractErrorMessage } from "../lib/api";

type ActivationState = "loading" | "success" | "error";

export const ActivateAccountPage = () => {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);
  const [state, setState] = useState<ActivationState>("loading");
  const [message, setMessage] = useState("Activando tu cuenta...");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("El enlace de activacion no es valido.");
      return;
    }

    let cancelled = false;
    api
      .post<{ message?: string }>("/auth/activate-parent", { token })
      .then((res) => {
        if (cancelled) return;
        setState("success");
        setMessage(res.data.message || "Cuenta activada. Ya podes iniciar sesion.");
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(extractErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const icon = state === "success" ? "check_circle" : state === "error" ? "error" : "progress_activity";
  const tone = state === "success" ? "text-emerald-500" : state === "error" ? "text-red-500" : "text-[var(--primary)]";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <MaterialIcon
          name={icon}
          filled={state !== "loading"}
          className={`mx-auto text-5xl ${tone} ${state === "loading" ? "animate-spin" : ""}`}
        />
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          {state === "success" ? "Cuenta activada" : state === "error" ? "No pudimos activar la cuenta" : "Activando cuenta"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <Link
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white shadow-lg"
          to="/login"
        >
          Ir al login
        </Link>
      </div>
    </div>
  );
};
