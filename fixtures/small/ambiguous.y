%token NUMBER

%%

expression:
    expression '+' expression
  | NUMBER
  ;

%%
