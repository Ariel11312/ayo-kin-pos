import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { ROLES, getRole, homeFor } from "./components/utils/roles";

export default function ProtectedRoute({ children, allowedRoles }) {
  const [state, setState] = useState({ loading: true, session: null });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setState({ loading: false, session: data.session });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) setState({ loading: false, session });
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (state.loading) return null;

  // Hindi naka-login
  if (!state.session) return <Navigate to="/" replace />;

  const role = getRole(state.session.user);

  // Walang role o hindi kilalang role -> walang access (iwas redirect loop)
  if (!ROLES.includes(role)) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        <h3>No access</h3>
        <p>Your account has no role assigned. Please contact your store manager.</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  }

  // Bawal ang role sa page na ito -> ibalik sa sariling home
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={homeFor(role)} replace />;
  }

  return children;
}