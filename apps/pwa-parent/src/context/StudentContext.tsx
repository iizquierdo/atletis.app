import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { extractErrorMessage } from "../lib/api";
import { fetchStudents } from "../lib/data";
import type { StudentSummary } from "../types";

const SELECTED_STUDENT_KEY = "ecosistema_parent_selected_student";

interface StudentContextValue {
  students: StudentSummary[];
  selectedStudent: StudentSummary | null;
  selectedStudentId: string | null;
  loading: boolean;
  error: string | null;
  setSelectedStudentId: (id: string) => void;
  refreshStudents: () => Promise<void>;
}

const StudentContext = createContext<StudentContextValue | null>(null);

export const StudentProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_STUDENT_KEY)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStudents = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const items = await fetchStudents();

      setStudents(items);

      const storedSelection = selectedStudentId ?? localStorage.getItem(SELECTED_STUDENT_KEY);
      const nextSelected =
        storedSelection && items.some((student) => student.id === storedSelection)
          ? storedSelection
          : items[0]?.id ?? null;

      setSelectedStudentIdState(nextSelected);
      if (nextSelected) {
        localStorage.setItem(SELECTED_STUDENT_KEY, nextSelected);
      } else {
        localStorage.removeItem(SELECTED_STUDENT_KEY);
      }
    } catch (fetchError) {
      setStudents([]);
      setError(extractErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, selectedStudentId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStudents([]);
      setSelectedStudentIdState(null);
      localStorage.removeItem(SELECTED_STUDENT_KEY);
      setLoading(false);
      setError(null);
      return;
    }

    void refreshStudents();
  }, [isAuthenticated, refreshStudents]);

  const setSelectedStudentId = useCallback((id: string) => {
    setSelectedStudentIdState(id);
    localStorage.setItem(SELECTED_STUDENT_KEY, id);
  }, []);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students]
  );

  const value = useMemo<StudentContextValue>(
    () => ({
      students,
      selectedStudent,
      selectedStudentId,
      loading,
      error,
      setSelectedStudentId,
      refreshStudents
    }),
    [
      error,
      loading,
      refreshStudents,
      selectedStudent,
      selectedStudentId,
      setSelectedStudentId,
      students
    ]
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
};

export const useStudents = () => {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error("useStudents must be used inside StudentProvider");
  }
  return context;
};
