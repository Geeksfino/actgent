export async function retry<T>(fn: () => Promise<T>, retries: number = 3, delay: number = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries === 0) {
      throw err;
    }

    const errorMessage = err?.message || String(err);
    console.error(`Request failed: ${errorMessage}, retrying in ${delay}ms (${retries} retries remaining)`);

    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}
