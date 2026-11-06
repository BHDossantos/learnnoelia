import { NextResponse } from "next/server";

export const runtime = "nodejs";

// The previous client entered the room without confirming the PaymentIntent.
// Fail closed until a server-verified authorization flow and its device tests
// are implemented. No configuration switch can accidentally enable this path.
export async function POST() {
  return NextResponse.json({
    error: "Paid tutoring is temporarily unavailable while payment authorization is completed. No payment has been requested.",
    code: "tutoring_payments_unavailable",
  }, { status: 503 });
}
