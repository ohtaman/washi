export async function loadNodeHighs(): Promise<any> {
  return (await import("highs")).default;
}
