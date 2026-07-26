%token SELECT FROM WHERE IDENT STRING NUMBER COMMA STAR EQ AND OR
%start select_stmt
%%
select_stmt:
    SELECT select_list FROM table_ref where_clause
  ;
select_list:
    STAR
  | separated_nonempty_list(COMMA, select_item)
  ;
select_item:
    IDENT
  | STRING
  | NUMBER
  ;
table_ref:
    IDENT
  ;
where_clause:
    %empty
  | WHERE expression
  ;
expression:
    predicate
  | expression AND predicate
  | expression OR predicate
  ;
predicate:
    IDENT EQ STRING
  | IDENT EQ NUMBER
  ;
%%
