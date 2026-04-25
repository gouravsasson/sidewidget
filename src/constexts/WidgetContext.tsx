import React, { createContext, useContext } from "react";

type WidgetContextType = {
  agent_id: string;
  schema: string;
  type: string;
  tool: string;
  agni_agent_id: string;
};

const WidgetContext = createContext<WidgetContextType | undefined>(undefined);

export const useWidgetContext = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidgetContext must be used within a WidgetProvider");
  }
  return context;
};

type WidgetProviderProps = {
  children: React.ReactNode;
  agent_id: string;
  schema: string;
  type: string;
  tool: string;
  agni_agent_id: string;
};

export const WidgetProvider: React.FC<WidgetProviderProps> = ({
  children,
  agent_id,
  schema,
  type,
  tool,
  agni_agent_id,
}) => {
  return (
    <WidgetContext.Provider value={{ agent_id, schema, type, tool, agni_agent_id }}>
      {children}
    </WidgetContext.Provider>
  );
};
