/** Prevent requests started by an earlier account/session from publishing results. */
export class SessionRequests {
  private generation = 0;
  private sequence = 0;
  private user = "";
  reset(user: string) {
    this.user = user;
    this.generation++;
  }
  async run<T>(
    user: string,
    fetchData: () => Promise<T>,
    publish: (data: T) => void,
  ) {
    if (user !== this.user) return;
    const generation = this.generation;
    const sequence = ++this.sequence;
    const data = await fetchData();
    if (
      this.user === user &&
      this.generation === generation &&
      this.sequence === sequence
    )
      publish(data);
  }
}
