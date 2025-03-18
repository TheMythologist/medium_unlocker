interface redirectSystemPathProps {
  path: string;
  initial: boolean;
}

export function redirectSystemPath({ path, initial }: redirectSystemPathProps) {
  return '/(tabs)';
}
