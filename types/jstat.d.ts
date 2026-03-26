declare module 'jstat' {
  const jStat: {
    mean(arr: number[]): number
    median(arr: number[]): number
    stdev(arr: number[], sample?: boolean): number
    variance(arr: number[], sample?: boolean): number
    min(arr: number[]): number
    max(arr: number[]): number
    percentile(arr: number[], p: number): number
    corrcoeff(x: number[], y: number[]): number
  }
  export default jStat
}
