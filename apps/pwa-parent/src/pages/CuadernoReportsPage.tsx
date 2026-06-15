import { useCallback, useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { extractErrorMessage } from "../lib/api";
import { fetchReports } from "../lib/data";
import type { StudentReport } from "../types";

const statusLabel: Record<StudentReport["status"], string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
};

const statusClass: Record<StudentReport["status"], string> = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived"
};

const getReportDateLabel = (report: StudentReport) => {
  const value = report.publishedAt ?? report.createdAt;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "SIN FECHA";
  return new Date(timestamp)
    .toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
    .toUpperCase();
};

export const CuadernoReportsPage = () => {
  const { selectedStudent } = useStudents();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<StudentReport[]>([]);

  const studentId = selectedStudent?.id ?? null;

  const loadReports = useCallback(async () => {
    if (!studentId) {
      setReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchReports(studentId);
      setReports(data);
    } catch (requestError) {
      setError(extractErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const sortedReports = useMemo(
    () =>
      [...reports].sort((left, right) => {
        const leftDate = Date.parse(left.publishedAt ?? left.createdAt);
        const rightDate = Date.parse(right.publishedAt ?? right.createdAt);
        return (Number.isNaN(rightDate) ? 0 : rightDate) - (Number.isNaN(leftDate) ? 0 : leftDate);
      }),
    [reports]
  );

  if (!selectedStudent) {
    return (
      <section className="empty-state-card">
        <h3>Sin alumno seleccionado</h3>
        <p>Selecciona un atleta en Resumen para ver sus informes.</p>
      </section>
    );
  }

  return (
    <div className="screen-stack notebook-screen">
      {error && (
        <div className="error-banner">
          <MaterialIcon className="error-banner-icon" name="warning" />
          <span>{error}</span>
        </div>
      )}

      <section className="notebook-hero">
        <span>SEGUIMIENTO DEL ALUMNO</span>
        <h2>
          Informes de <em>Progreso</em>
        </h2>
      </section>

      <section className="reports-card">
        <header className="reports-card-head">
          <h3>Informes cargados</h3>
          <small>{sortedReports.length} registro(s)</small>
        </header>

        <div className="reports-list">
          {loading && <p className="notebook-placeholder">Cargando informes...</p>}

          {!loading && sortedReports.length === 0 && (
            <p className="notebook-placeholder">No hay informes para este alumno.</p>
          )}

          {!loading &&
            sortedReports.map((report) => (
              <article className="report-item" key={report.id}>
                <div className="report-item-head">
                  <div className="archive-badges">
                    <span className={`report-status-pill ${statusClass[report.status]}`}>{statusLabel[report.status]}</span>
                    <span className="date-pill">{getReportDateLabel(report)}</span>
                  </div>
                  <MaterialIcon className="report-type-icon" name="description" />
                </div>

                <h4>{report.title}</h4>
                {report.summary && <p className="report-summary">{report.summary}</p>}
                <p className="report-content">{report.content}</p>
                <small className="report-author">
                  Autor: {report.author.firstName} {report.author.lastName}
                </small>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
};
