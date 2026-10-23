export function confirmsProposal(text: string, action: string): boolean {
  const command = text
    .toLocaleLowerCase("nl-NL")
    .replace(/[.,!?]/g, "")
    .trim();
  return action === "delete"
    ? command === "ja verwijderen"
    : ["ja opslaan", "ja uitvoeren"].includes(command);
}
