import { createContext } from 'react';

type CurrentUrlContextValues = [string, React.Dispatch<React.SetStateAction<string>>];

function createCurrentUrlContext() {
  const value: CurrentUrlContextValues = ['https://freedium.cfd', () => {}];

  return createContext(value);
}

export const CurrentUrlContext = createCurrentUrlContext();
