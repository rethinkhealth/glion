import { MllpClientError } from "./base";

/**
 * A failure of the wire: the connection could not be opened, gave no reply in
 * time, or was lost. Raised by the layer that holds the socket; the client
 * relays it unchanged.
 */
export abstract class MllpConnectionError extends MllpClientError {}
