import { assertEquals } from "https://deno.land/std@0.82.0/testing/asserts.ts";
import { VSCodeIO } from "./msg.ts";

Deno.test("write", async () => {
  const reader = new Deno.Buffer();
  const writer = new Deno.Buffer();
  const io = new VSCodeIO({
    reader: reader,
    writer: writer,
  });

  await io.write("1234567890");
  assertEquals(
    new TextDecoder().decode(Deno.readAllSync(writer)),
    "Content-Length: 10\r\n\r\n1234567890",
  );
});

Deno.test("read", async () => {
  const reader = new Deno.Buffer();
  const writer = new Deno.Buffer();
  const io = new VSCodeIO({
    reader: reader,
    writer: writer,
  });

  await Deno.writeAll(
    reader,
    new TextEncoder().encode("Content-Length: 10\r\n\r\n1234567890"),
  );

  assertEquals(
    await io.read(),
    "1234567890",
  );
});

