import { checkForClosingTag } from ".";
import { CODE, StateDefinition } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE: StateDefinition = {
  name: "JS_COMMENT_LINE",

  eol() {
    this.exitState();
  },

  eof() {
    this.exitState();
  },

  char(_, code) {
    if (
      !this.isConcise &&
      code === CODE.OPEN_ANGLE_BRACKET &&
      this.textParseMode === "parsed-text"
    ) {
      // First, see if we need to see if we reached the closing tag
      // eg: <script>//foo</script>
      checkForClosingTag(this);
    }
  },
};
