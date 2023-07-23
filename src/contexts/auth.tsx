"use client";

import { createContext, useContext, useState } from "react";

interface AuthContextProps {
  email: string;
  name: string;
  image: string;
}

const AuthContext = createContext<AuthContextProps>({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState<AuthContextProps>({
    email: "",
    name: "",
    image: "",
  });

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
