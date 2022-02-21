import {
  STATE,
  CODE,
  isWhitespaceCode,
  StateDefinition,
  Range,
  ExpressionRange,
} from "../internal";

const enum ATTR_STATE {
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrRange extends Range {
  state: undefined | ATTR_STATE;
  name: undefined | Range;
  value: undefined | ExpressionRange;
  valueStart: undefined | number;
  argument: undefined | ExpressionRange;
  default: boolean;
  spread: boolean;
  method: boolean;
  bound: boolean;
}

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE: StateDefinition<AttrRange> = {
  name: "ATTRIBUTE",

  enter(attr) {
    this.activeAttr = attr;
    attr.state = undefined;
    attr.name = undefined;
    attr.value = undefined;
    attr.bound = false;
    attr.method = false;
    attr.spread = false;
    attr.default = this.activeTag!.attributes.length === 0;
  },

  exit() {
    this.activeAttr = undefined;
  },

  eol() {
    if (this.isConcise) {
      this.exitState();
    }
  },

  eof(attr) {
    if (this.isConcise) {
      this.exitState();
    } else {
      this.notifyError(
        attr,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          (attr.name ? this.read(attr.name) : "default") +
          '" for the "' +
          this.read(this.activeTag!.tagName) +
          '" tag'
      );
    }
  },

  return(_, childPart, attr) {
    switch (attr.state) {
      case ATTR_STATE.NAME: {
        attr.name = {
          start: childPart.start,
          end: childPart.end,
        };
        break;
      }
      case ATTR_STATE.ARGUMENT: {
        if (attr.argument) {
          this.notifyError(
            childPart,
            "ILLEGAL_ATTRIBUTE_ARGUMENT",
            "An attribute can only have one set of arguments"
          );
          return;
        }

        attr.argument = {
          start: childPart.start - 1, // include (
          end: this.skip(1), // include )
          value: {
            start: childPart.start,
            end: childPart.end,
          },
        };
        break;
      }
      case ATTR_STATE.BLOCK: {
        attr.method = true;
        attr.value = {
          start: childPart.start - 1, // include {
          end: this.skip(1), // include }
          value: {
            start: childPart.start,
            end: childPart.end,
          },
        };
        this.exitState();
        break;
      }

      case ATTR_STATE.VALUE: {
        if (childPart.start === childPart.end) {
          return this.notifyError(
            childPart,
            "ILLEGAL_ATTRIBUTE_VALUE",
            "Missing value for attribute"
          );
        }

        attr.value = {
          start: attr.valueStart!,
          end: childPart.end,
          value: {
            start: childPart.start,
            end: childPart.end,
          },
        };

        attr.valueStart = undefined;
        this.exitState();
        break;
      }
    }
  },

  char(code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      attr.valueStart = this.pos;

      if (code === CODE.COLON) {
        attr.bound = true;
        this.skip(2); // skip :=
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.skip(3); // skip ...
      } else {
        this.skip(1); // skip =
        this.consumeWhitespace();
      }

      attr.state = ATTR_STATE.VALUE;
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: true,
        terminator: [
          this.isConcise ? "]" : "/>",
          this.isConcise ? ";" : ">",
          ",",
        ],
      });

      this.rewind(1);
    } else if (code === CODE.OPEN_PAREN) {
      attr.state = ATTR_STATE.ARGUMENT;
      this.skip(1); // skip (
      this.enterState(STATE.EXPRESSION, {
        terminator: ")",
      });
      this.rewind(1);
    } else if (
      code === CODE.OPEN_CURLY_BRACE &&
      (!attr.name || attr.argument)
    ) {
      attr.state = ATTR_STATE.BLOCK;
      this.skip(1); // skip {
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: false,
        terminator: "}",
      });
      this.rewind(1);
    } else if (attr.state === undefined) {
      attr.default = false;
      attr.state = ATTR_STATE.NAME;
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: true,
        skipOperators: true,
        terminator: [
          this.isConcise ? "]" : "/>",
          this.isConcise ? ";" : ">",
          ":=",
          "=",
          ",",
          "(",
        ],
      });
      this.rewind(1);
    } else {
      this.exitState();
    }
  },
};
