"use client";

import { createPolymorphicComponent, Paper, type PaperProps } from "@mantine/core";
import type { Ref } from "react";
import classes from "./data-list-paper.module.css";

export const DataListPaper = createPolymorphicComponent<"div", PaperProps>(function DataListPaper({
  className,
  ...props
}: PaperProps & { ref?: Ref<HTMLDivElement> }) {
  return (
    <Paper
      {...props}
      className={className ? `${classes.root} ${className}` : classes.root}
      data-list-paper
    />
  );
});
