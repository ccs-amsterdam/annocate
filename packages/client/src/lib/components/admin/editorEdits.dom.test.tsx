// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DesignItem, SessionItem } from "@annotinder/contracts";
import { SessionHeader } from "./designEditor/SessionHeader";
import type { DesignDraft } from "./designEditor/useDesignDraft";
import { ItemForm } from "./ItemForm";

// The editor's forms, clicked as a researcher does: a setting that is turned
// off or emptied is gone from the item (not kept as "" or false), so a saved
// design doesn't hold it any more.

afterEach(cleanup);

/** The form of an item, which keeps what the form changes; `item()` is the item as it is now. */
function edited<T extends DesignItem>(start: T, inLoop = false) {
  let latest: DesignItem = start;
  function Form() {
    const [item, setItem] = useState<DesignItem>(start);
    latest = item;
    return <ItemForm item={item} groups={[]} inLoop={inLoop} onChange={setItem} />;
  }
  render(<Form />);
  return { item: () => latest as T & Record<string, unknown> };
}

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe("a question's settings", () => {
  const question = {
    type: "question",
    name: "topic",
    variable: { type: "confirm", question: "Is it about sports?" },
    comments: true,
  } as DesignItem;

  it('unticking "Coders can add a comment" removes the setting', () => {
    const { item } = edited(question, true);
    const box = () => screen.getByText("Coders can add a comment").querySelector<HTMLInputElement>("input")!;
    expect(box().checked).toBe(true);
    fireEvent.click(box());
    expect(item()).not.toHaveProperty("comments");
    expect(box().checked).toBe(false);
    fireEvent.click(box());
    expect(item().comments).toBe(true);
  });
});

describe("an end item's settings", () => {
  const end = (more: object) => ({ type: "end", name: "done", outcome: "complete", ...more }) as DesignItem;

  it("an emptied message is removed", () => {
    const { item } = edited(end({ message: "Thanks!" }));
    type(screen.getByPlaceholderText("Thank you for your time."), "");
    expect(item()).not.toHaveProperty("message");
  });

  it('sending coders "Nowhere" removes the redirect', () => {
    const { item } = edited(end({ redirectUrl: "https://panel.example/back" }));
    type(screen.getByLabelText("Redirect"), "");
    expect(item()).toEqual({ type: "end", name: "done", outcome: "complete" });
  });

  it("a URL and a panel's return link are one or the other: choosing one removes the other", () => {
    const { item } = edited(end({ redirectUrl: "https://panel.example/back" }));
    type(screen.getByLabelText("Redirect"), "setting");
    expect(item()).not.toHaveProperty("redirectUrl");
    expect(item().redirectSetting).toBe("panel_return");
    type(screen.getByLabelText("Setting name"), "my_panel");
    expect(item().redirectSetting).toBe("my_panel");
    type(screen.getByLabelText("Redirect"), "url");
    expect(item()).not.toHaveProperty("redirectSetting");
    expect(item().redirectUrl).toBe("");
  });

  it("a screen-out's return link has its own setting by default", () => {
    const { item } = edited(end({ outcome: "screenout" }));
    type(screen.getByLabelText("Redirect"), "setting");
    expect(item().redirectSetting).toBe("panel_screenout");
  });
});

describe("a layout's snippets", () => {
  const layout = (snippets: Record<string, string>) =>
    ({ type: "layout", template: "::: style color: red\n$unit.text\n:::\n[[note]]", snippets }) as DesignItem;

  it("deleting the last snippet removes the snippets", () => {
    const { item } = edited(layout({ note: "Read it all" }), true);
    fireEvent.click(screen.getByLabelText("Remove note"));
    expect(item()).not.toHaveProperty("snippets");
  });

  it("deleting one of two keeps the other; a new one gets a name that is free", () => {
    const { item } = edited(layout({ note: "Read it all", snippet_2: "More" }), true);
    fireEvent.click(screen.getByLabelText("Remove note"));
    expect(item().snippets).toEqual({ snippet_2: "More" });
    fireEvent.click(screen.getByText("Snippet"));
    expect(item().snippets).toEqual({ snippet_2: "More", snippet_3: "" });
  });

  it("a snippet can't take the name of another (they would merge)", () => {
    const { item } = edited(layout({ note: "Read it all", other: "More" }), true);
    type(screen.getAllByLabelText("Snippet name")[1], "note");
    expect(item().snippets).toEqual({ note: "Read it all", other: "More" });
    type(screen.getAllByLabelText("Snippet name")[1], "more");
    expect(item().snippets).toEqual({ note: "Read it all", more: "More" });
  });
});

/** The header above the item tree, on a draft that holds the Study entry. */
function header(start: SessionItem) {
  let session = { ...start, _key: "study" } as SessionItem;
  const select = vi.fn();
  function Header() {
    const [item, setItem] = useState(session);
    session = item;
    const draft = {
      items: [item],
      selected: null,
      validationErrors: [],
      select,
      update: (_key: string, next: DesignItem) => setItem(next as SessionItem),
    } as unknown as DesignDraft;
    return <SessionHeader draft={draft} readOnly={false} />;
  }
  render(<Header />);
  return { session: () => session as SessionItem & Record<string, unknown>, select };
}

describe("the Study entry", () => {
  it("an emptied title removes what coders see as the study's name", () => {
    const { session } = header({ type: "session", public: { title: "News study" } } as SessionItem);
    const title = screen.getByLabelText<HTMLInputElement>("Title shown to coders");
    expect(title.value).toBe("News study");
    type(title, "");
    expect(session()).not.toHaveProperty("public");
    expect(screen.getByLabelText<HTMLInputElement>("Title shown to coders").value).toBe("");
    type(screen.getByLabelText("Title shown to coders"), "Headlines");
    expect(session().public).toEqual({ title: "Headlines" });
  });

  it("removing the last URL parameter removes the URL parameters", () => {
    const { select } = header({ type: "session", urlParams: [{ name: "wave" }] } as SessionItem);
    // The header's button opens the Study entry's form on its URL parameters
    fireEvent.click(screen.getByText("URL parameters"));
    expect(select).toHaveBeenCalledWith("study");
    cleanup();
    const { item } = edited({ type: "session", urlParams: [{ name: "wave" }] } as DesignItem);
    fireEvent.click(screen.getByLabelText("Remove wave"));
    expect(item()).toEqual({ type: "session" });
    fireEvent.click(screen.getByText("URL parameter"));
    expect(item().urlParams).toEqual([{ name: "param_1" }]);
  });
});
