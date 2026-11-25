import { describe, expect, it } from "vitest";
import { codersToCreate, parseCoders } from "./parseCoders";

const read = (text: string, idIsEmail = false, existing: { coder: string; email: string | null }[] = []) =>
  parseCoders(text, { idIsEmail, existing });
const ok = (line: number, coder: string, email: string | null = null) => ({ line, coder, email, error: null });

describe("the Add coders text", () => {
  it("is a coder per line: an id, or an id and an email address", () => {
    expect(read("anna\nbob,bob@uni.nl\ncarl; carl@uni.nl\ndora\tdora@uni.nl")).toEqual([
      ok(1, "anna"),
      ok(2, "bob", "bob@uni.nl"),
      ok(3, "carl", "carl@uni.nl"),
      ok(4, "dora", "dora@uni.nl"),
    ]);
  });

  it("skips empty lines and spaces around values; line numbers are the text's", () => {
    expect(read("\n  anna  \n\n bob ,  bob@uni.nl \r\n")).toEqual([ok(2, "anna"), ok(4, "bob", "bob@uni.nl")]);
    expect(read("")).toEqual([]);
    expect(read("  \n\n")).toEqual([]);
  });

  it("an id without an address after the separator has none", () => {
    expect(read("anna,")).toEqual([ok(1, "anna")]);
  });

  it("skips a header line, whatever its case", () => {
    expect(read("coder,email\nanna,anna@uni.nl")).toEqual([ok(2, "anna", "anna@uni.nl")]);
    expect(read("Coder ID\tE-mail\nanna")).toEqual([ok(2, "anna")]);
    expect(read("id\nanna")).toEqual([ok(2, "anna")]);
    // Only the first line, and only when it names the columns
    expect(read("anna\ncoder").map((p) => p.coder)).toEqual(["anna", "coder"]);
    expect(read("coder,anna@uni.nl").map((p) => p.coder)).toEqual(["coder"]);
  });

  it("the coder id is the email address: each line is an address that is both", () => {
    expect(read("anna@uni.nl\nBob@Uni.nl", true)).toEqual([
      ok(1, "anna@uni.nl", "anna@uni.nl"),
      ok(2, "Bob@Uni.nl", "Bob@Uni.nl"),
    ]);
    expect(read("email\nanna@uni.nl", true)).toEqual([ok(2, "anna@uni.nl", "anna@uni.nl")]);
    expect(read("anna", true)[0].error).toBe("Not an email address: anna");
    expect(read("anna,anna@uni.nl", true)[0].error).toBe("One email address per line");
  });

  it("says per line what is wrong: the id, the address, or too many values", () => {
    const errors = read(`${"x".repeat(65)}\nanna,not-an-address\nbob,bob@uni.nl,extra\nan#na\n,carl@uni.nl`).map(
      (p) => p.error,
    );
    expect(errors).toEqual([
      "A coder id has at most 64 characters",
      "Not an email address: not-an-address",
      "Too many values: a coder id, or a coder id and an email address",
      "A coder id has no ; or #",
      "A coder id can't be empty",
    ]);
  });

  it("refuses an id given twice, ignoring case; the first stays", () => {
    expect(read("anna\nbob\nAnna").map((p) => p.error)).toEqual([null, null, "There is a coder with this id already"]);
  });

  it("refuses an id or an address one of the study's coders has", () => {
    const existing = [{ coder: "Anna", email: "anna@uni.nl" }];
    expect(read("anna\nbob,ANNA@uni.nl\ncarl,carl@uni.nl", false, existing).map((p) => p.error)).toEqual([
      "There is a coder with this id already",
      "Another coder has this email address",
      null,
    ]);
  });

  it("refuses an address two lines share", () => {
    expect(read("anna,a@uni.nl\nbob,A@uni.nl").map((p) => p.error)).toEqual([
      null,
      "Another coder has this email address",
    ]);
  });
});

describe("what is saved", () => {
  it("is every coder read, with their address where they have one", () => {
    expect(codersToCreate(read("anna\nbob,bob@uni.nl"))).toEqual({
      coders: [{ coder: "anna" }, { coder: "bob", email: "bob@uni.nl" }],
    });
  });

  it("is nothing while a line has an error, or without any coder", () => {
    expect(codersToCreate(read("anna\nanna"))).toBeNull();
    expect(codersToCreate(read(""))).toBeNull();
  });
});
