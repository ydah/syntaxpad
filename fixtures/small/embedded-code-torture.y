%token TOKEN
%%
start:
    TOKEN {
      char open = '{';
      char close = '}';
      const char *braces = "{ still text }";
      const char *raw = R"tag({ raw } $ignored)tag";
      /* } $ignored */
      // { @ignored
#define OPEN_BLOCK { \
        }
      if (open) {
        $$ = $<node>1;
        @$ = @1;
      }
    }
  ;
%%
