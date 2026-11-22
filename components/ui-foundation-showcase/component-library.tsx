"use client";

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Group,
  Input,
  Loader,
  Menu,
  MultiSelect,
  NavLink,
  Notification,
  NumberInput,
  Paper,
  PasswordInput,
  Popover,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput, DateTimePicker, TimeInput } from "@mantine/dates";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconDots,
  IconFileText,
  IconInfoCircle,
  IconLayoutGrid,
  IconList,
  IconStar,
  IconX,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { AdminDateInput } from "@/components/admin-date-input";
import { adminPalettes, adminSemanticColors, adminTokens } from "@/lib/admin-theme";

const categories = ["Cải tạo đất", "Đa dạng sinh học", "Theo dõi sau mưa"];
const semanticEntries = Object.entries(adminSemanticColors);

function ColorSample({ token, value }: { token: string; value: string }) {
  return (
    <Stack gap={4} miw={0}>
      <Box
        h={26}
        bg={value}
        style={{ border: "1px solid var(--border)", borderRadius: "var(--mantine-radius-sm)" }}
        aria-hidden
      />
      <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
        {token}
      </Text>
      <Text component="code" size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </Stack>
  );
}

function ColorLibrary() {
  return (
    <Stack component="section" aria-labelledby="colors-and-tokens" gap="md">
      <Title order={2} id="colors-and-tokens">
        Colors and tokens
      </Title>
      <Paper p="md">
        <Stack gap="lg">
          {(["forest", "gray"] as const).map((name) => (
            <Stack key={name} gap="xs">
              <Title order={3} tt="capitalize">
                {name}
              </Title>
              <Box
                display="grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(66px, 1fr))",
                  gap: "var(--mantine-spacing-xs)",
                }}
              >
                {adminPalettes[name].map((value, index) => (
                  <ColorSample key={value} token={`${name}.${index}`} value={value} />
                ))}
              </Box>
            </Stack>
          ))}
          <Stack gap="xs">
            <Title order={3}>Foundation variables</Title>
            <Box
              display="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
                gap: "var(--mantine-spacing-sm)",
              }}
            >
              {Object.entries(adminTokens).map(([name, value]) => (
                <ColorSample key={name} token={`--${name}`} value={value} />
              ))}
            </Box>
          </Stack>
          <Stack gap="xs">
            <Title order={3}>Semantic foreground and background</Title>
            <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="sm">
              {semanticEntries.map(([role, { foreground, background }]) => (
                <Stack key={role} gap={4} align="flex-start">
                  <Badge color={role} tt="capitalize">
                    {role}
                  </Badge>
                  <Text component="code" size="xs" c="dimmed">
                    --{role} {foreground}
                    <br />
                    --{role}-soft {background}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
            <Text component="code" size="xs" c="dimmed">
              --danger-hover {adminSemanticColors.danger.hover}
            </Text>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

function TypeExamples() {
  const { headings } = useMantineTheme();

  return (
    <Stack component="section" gap="md" aria-labelledby="typography-examples">
      <Title id="typography-examples" order={2}>
        Typography
      </Title>
      <Paper p="md">
        <Stack gap="xs">
          {(
            [
              ["h1", "Page heading"],
              ["h2", "Section heading"],
              ["h3", "Subsection heading"],
            ] as const
          ).map(([size, label]) => (
            <Title key={size} order={3} size={size}>
              {label}{" "}
              <Text component="span" size="sm" c="dimmed">
                {size.toUpperCase()} · {headings.sizes[size].fontSize}
              </Text>
            </Title>
          ))}
          <Text>Ghi nhận thay đổi về độ ẩm và chất lượng đất sau mùa mưa.</Text>
          <Text size="sm" c="dimmed">
            Secondary text for context and dates.
          </Text>
          <Text size="xs" c="var(--text-subtle)">
            Supporting text for constraints and hints.
          </Text>
          <TextInput
            label="Field label"
            description="The description explains what to enter."
            placeholder="Example value"
            maw={320}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

function ScaleExamples() {
  const { spacing, radius, defaultRadius } = useMantineTheme();

  return (
    <Stack component="section" gap="md" aria-labelledby="scale-examples">
      <Title id="scale-examples" order={2}>
        Spacing and radii
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper p="md">
          <Stack gap="sm">
            <Title order={3}>Spacing</Title>
            {Object.entries(spacing).map(([size, value]) => (
              <Group key={size} gap="sm">
                <Text component="code" size="sm" w="7.5rem">
                  {size} · {value}
                </Text>
                <Box aria-hidden w={value} h="xs" bg="var(--primary)" />
              </Group>
            ))}
          </Stack>
        </Paper>
        <Paper p="md">
          <Stack gap="sm">
            <Title order={3}>Corner radii</Title>
            <Group gap="md">
              {Object.entries(radius).map(([size, value]) => (
                <Stack key={size} gap="xs" align="flex-start">
                  <Box
                    aria-hidden
                    w="2.5rem"
                    h="2.5rem"
                    bg="var(--primary-soft)"
                    style={{
                      border: "1px solid var(--control-border)",
                      borderRadius: `var(--mantine-radius-${size})`,
                    }}
                  />
                  <Text component="code" size="sm">
                    {size} · {value}
                  </Text>
                </Stack>
              ))}
            </Group>
            <Text size="sm" c="dimmed">
              Default radius: {defaultRadius}
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

function ActionExamples() {
  const [lastAction, setLastAction] = useState("");
  const actions = [
    { variant: "filled", label: "Primary" },
    { variant: "default", label: "Default" },
    { variant: "outline", label: "Outline" },
    { variant: "light", label: "Light" },
    { variant: "subtle", label: "Subtle" },
    { variant: "filled", color: "danger", label: "Destructive" },
  ];

  return (
    <Stack component="section" gap="md" aria-labelledby="action-examples">
      <Title id="action-examples" order={2}>
        Buttons and actions
      </Title>
      <Paper p="md">
        <Stack gap="sm">
          <Group gap="xs">
            {actions.map(({ variant, color, label }) => (
              <Button
                key={label}
                variant={variant}
                color={color}
                onClick={() => setLastAction(label)}
              >
                {label}
              </Button>
            ))}
            <Tooltip label="Favorite example" events={{ hover: true, focus: true, touch: true }}>
              <ActionIcon
                variant="default"
                aria-label="Favorite example"
                onClick={() => setLastAction("Favorite")}
              >
                <IconStar size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
            <Button loading disabled aria-label="Loading button example">
              Loading
            </Button>
            <Button disabled>Disabled</Button>
          </Group>
          {lastAction && (
            <Text role="status" size="sm" c="dimmed">
              {lastAction} action activated.
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

function FormExamples() {
  const focusExample = useRef<HTMLInputElement>(null);
  const [comparisonValue, setComparisonValue] = useState("");
  const [observationDate, setObservationDate] = useState("22/11/2026");

  return (
    <Stack component="section" gap="md" aria-labelledby="form-examples">
      <Title id="form-examples" order={2}>
        Form inputs
      </Title>
      <Paper p="md">
        <Stack gap="md">
          <Title order={3}>Input interaction</Title>
          <Text c="dimmed" size="sm">
            Hover or focus the comparison field, then focus the invalid field to inspect its error
            border.
          </Text>
          <Group align="flex-end" gap="xs">
            <TextInput
              label="Control comparison"
              flex="1 1 9rem"
              ref={focusExample}
              value={comparisonValue}
              placeholder="Enter a record code"
              onChange={(event) => setComparisonValue(event.currentTarget.value)}
            />
            <Group gap="xs" wrap="nowrap">
              <Button variant="default" onClick={() => focusExample.current?.focus()}>
                Focus field
              </Button>
              <Tooltip label="Clear comparison input">
                <ActionIcon
                  variant="default"
                  aria-label="Clear comparison input"
                  onClick={() => {
                    setComparisonValue("");
                    focusExample.current?.focus();
                  }}
                >
                  <IconX size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
            <Input.Wrapper id="populated-input" label="Populated input">
              <Input id="populated-input" defaultValue="Khảo sát độ ẩm lớp phủ" />
            </Input.Wrapper>
            <TextInput
              label="Invalid code"
              defaultValue="NFV"
              error="Include a three-digit record number."
            />
            <TextInput label="Read-only code" value="NFV-001" readOnly />
            <TextInput label="Disabled field" defaultValue="Unavailable" disabled />
          </SimpleGrid>
        </Stack>
      </Paper>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Entry fields</Title>
            <Select label="Observation category" data={categories} defaultValue={categories[0]} />
            <MultiSelect
              label="Observation tags"
              data={categories}
              placeholder="Select tags"
              defaultValue={[categories[1]]}
            />
            <PasswordInput
              label="Sample password"
              description="Use the visibility toggle to inspect the icon action."
              defaultValue="sample-secret"
              visibilityToggleButtonProps={{
                "aria-label": "Toggle sample password visibility",
                tabIndex: 0,
              }}
            />
            <NumberInput
              label="Number of plots"
              description="Minimum of one plot."
              min={1}
              defaultValue={4}
            />
            <Textarea
              label="Observation notes"
              placeholder="Ghi nhận tình trạng đất và lớp phủ"
              minRows={3}
            />
          </Stack>
        </Paper>
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Date and time</Title>
            <Input.Wrapper id="observation-date" label="Observation date">
              <AdminDateInput
                id="observation-date"
                pickerLabel="Choose observation date"
                value={observationDate}
                onValueChange={setObservationDate}
              />
            </Input.Wrapper>
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <Input.Wrapper id="readonly-observation-date" label="Read-only date">
                <AdminDateInput
                  id="readonly-observation-date"
                  pickerLabel="Choose read-only date"
                  value={observationDate}
                  onValueChange={setObservationDate}
                  readOnly
                />
              </Input.Wrapper>
              <Input.Wrapper id="disabled-observation-date" label="Disabled date">
                <AdminDateInput
                  id="disabled-observation-date"
                  pickerLabel="Choose disabled date"
                  value={observationDate}
                  onValueChange={setObservationDate}
                  disabled
                />
              </Input.Wrapper>
            </SimpleGrid>
            <DatePickerInput
              type="range"
              label="Monitoring period"
              placeholder="Select a date range"
              valueFormat="DD/MM/YYYY"
            />
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <DateTimePicker label="Review schedule" placeholder="Select a date and time" />
              <TimeInput label="Irrigation time" />
            </SimpleGrid>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

function SelectionExamples() {
  return (
    <Stack component="section" gap="md" aria-labelledby="selection-examples">
      <Title id="selection-examples" order={2}>
        Selection controls
      </Title>
      <Paper p="md">
        <Stack gap="md">
          <Group gap="md">
            <Checkbox label="Include field notes" />
            <Checkbox label="Flag for follow-up" defaultChecked />
            <Checkbox label="Some records selected" indeterminate />
            <Checkbox label="Archived record" disabled />
            <Checkbox label="Confirm review" error="Review confirmation is required." />
          </Group>
          <Radio.Group label="Visibility" defaultValue="internal">
            <Group gap="md" mt="xs">
              <Radio label="Internal" value="internal" />
              <Radio label="Team" value="team" />
              <Radio label="Published" value="published" disabled />
              <Radio
                label="External"
                value="external"
                error="External visibility needs approval."
              />
            </Group>
          </Radio.Group>
          <Group gap="md" align="flex-start">
            <Switch label="Send reminders" />
            <Switch label="Enable follow-up" defaultChecked />
            <Switch label="Archive reminders" disabled />
            <Switch label="Notify reviewers" error="Reviewer notifications are required." />
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

type ShowcaseComponentsProps = { onNavigate: (tab: "list" | "details") => void };

function NavigationExamples({ onNavigate }: ShowcaseComponentsProps) {
  const [active, setActive] = useState("observations");
  return (
    <Stack component="section" gap="md" aria-labelledby="navigation-examples">
      <Title id="navigation-examples" order={2}>
        Navigation and floating controls
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Navigation controls</Title>
            <Breadcrumbs
              aria-label="Example breadcrumb"
              component="nav"
              style={{ flexWrap: "wrap" }}
            >
              <Anchor component="button" type="button" onClick={() => onNavigate("list")}>
                Sample records
              </Anchor>
              <Text aria-current="page">
                {active === "observations" ? "Observations" : "Trial plots"}
              </Text>
            </Breadcrumbs>
            <Box component="nav" aria-label="Example navigation">
              <NavLink
                component="button"
                type="button"
                label="Observations"
                active={active === "observations"}
                leftSection={<IconList size={16} aria-hidden />}
                onClick={() => setActive("observations")}
              />
              <NavLink
                component="button"
                type="button"
                label="Trial plots"
                active={active === "plots"}
                leftSection={<IconLayoutGrid size={16} aria-hidden />}
                onClick={() => setActive("plots")}
              />
            </Box>
            <SegmentedControl
              aria-label="Example record layout"
              data={[
                { value: "list", label: "List" },
                { value: "grid", label: "Grid" },
              ]}
              defaultValue="list"
            />
          </Stack>
        </Paper>
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Floating controls</Title>
            <Group gap="sm">
              <Menu>
                <Menu.Target>
                  <Button variant="default" leftSection={<IconDots size={16} aria-hidden />}>
                    Menu
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Showcase navigation</Menu.Label>
                  <Menu.Item onClick={() => onNavigate("list")}>Data List</Menu.Item>
                  <Menu.Item onClick={() => onNavigate("details")}>Detail &amp; Dialog</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Popover width={220} position="bottom-start" withArrow shadow="sm" returnFocus>
                <Popover.Target>
                  <Button variant="light">Popover</Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm">Use the menu to jump to the sample records or dialogs.</Text>
                </Popover.Dropdown>
              </Popover>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

const feedbackExamples = {
  success: {
    title: "Sample saved",
    message: "The example record is ready for review.",
    icon: IconCheck,
  },
  pending: {
    title: "Review pending",
    message: "Check the observation details before confirming the review.",
    icon: IconClock,
  },
  warning: {
    title: "Follow-up needed",
    message: "Check the moisture reading again after the next irrigation.",
    icon: IconAlertTriangle,
  },
  danger: {
    title: "Validation error",
    message: "The record code is missing its sequence number.",
    icon: IconX,
  },
  info: {
    title: "Observation recorded",
    message: "The field notes are available in the sample record.",
    icon: IconInfoCircle,
  },
  neutral: {
    title: "Draft retained",
    message: "You can finish the observation later.",
    icon: IconFileText,
  },
} satisfies Record<
  keyof typeof adminSemanticColors,
  { title: string; message: string; icon: typeof IconCheck }
>;

const feedbackEntries = Object.entries(feedbackExamples);
const notificationRoles = feedbackEntries.map(([role]) => role);

function FeedbackExamples() {
  const [notificationRole, setNotificationRole] = useState<string | null>(null);
  const notificationSelect = useRef<HTMLInputElement>(null);
  const notification = feedbackEntries.find(([role]) => role === notificationRole)?.[1];

  return (
    <Stack component="section" gap="md" aria-labelledby="feedback-examples">
      <Title id="feedback-examples" order={2}>
        Feedback
      </Title>
      <Paper p="md" miw={0}>
        <Stack gap="md">
          <Group gap="xs">
            {semanticEntries.map(([role]) => (
              <Badge color={role} key={role} tt="capitalize">
                {role}
              </Badge>
            ))}
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
            {feedbackEntries.map(([role, { title, message, icon: Icon }]) => (
              <Alert key={role} title={title} color={role} icon={<Icon size={18} aria-hidden />}>
                {message}
              </Alert>
            ))}
          </SimpleGrid>
          <Stack gap="sm" miw={0}>
            <Select
              ref={notificationSelect}
              label="Notification role"
              placeholder="Choose a role"
              data={notificationRoles}
              value={notificationRole}
              onChange={setNotificationRole}
              maw={220}
            />
            {notification && (
              <Notification
                color={notificationRole ?? undefined}
                title={notification.title}
                icon={<notification.icon size={16} aria-hidden />}
                onClose={() => {
                  setNotificationRole(null);
                  notificationSelect.current?.focus();
                }}
                closeButtonProps={{ "aria-label": "Dismiss sample notification" }}
                role="status"
                withBorder
              >
                {notification.message}
              </Notification>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

function LoadingExamples() {
  return (
    <Stack component="section" gap="md" aria-labelledby="loading-examples">
      <Title id="loading-examples" order={2}>
        Loading indicators
      </Title>
      <Paper p="md">
        <Stack gap="sm" maw="24rem">
          <Group gap="sm">
            <Loader size="sm" aria-label="Loading example" />
            <Text size="sm" c="dimmed">
              Loading preview
            </Text>
          </Group>
          <Stack gap="xs" role="img" aria-label="Skeleton loading placeholder">
            <Skeleton height={12} width="72%" />
            <Skeleton height={12} width="55%" />
            <Skeleton height={12} width="84%" />
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function ShowcaseColor() {
  return (
    <>
      <ColorLibrary />
      <TypeExamples />
      <ScaleExamples />
    </>
  );
}

export function ShowcaseComponents({ onNavigate }: ShowcaseComponentsProps) {
  return (
    <>
      <FormExamples />
      <ActionExamples />
      <SelectionExamples />
      <NavigationExamples onNavigate={onNavigate} />
      <FeedbackExamples />
      <LoadingExamples />
    </>
  );
}
