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
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { DateInput, DatePickerInput, DateTimePicker, TimeInput } from "@mantine/dates";
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
          {Object.entries(adminPalettes).map(([name, palette]) => (
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
                {palette.map((value, index) => (
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
  return (
    <Stack component="section" gap="md" aria-labelledby="typography-examples">
      <Title id="typography-examples" order={2}>
        Typography
      </Title>
      <Paper p="md">
        <Stack gap="xs">
          <Title order={3} size="h1">
            Page heading{" "}
            <Text component="span" size="sm" c="dimmed">
              H1
            </Text>
          </Title>
          <Title order={3} size="h2">
            Section heading{" "}
            <Text component="span" size="sm" c="dimmed">
              H2
            </Text>
          </Title>
          <Title order={3} size="h3">
            Subsection heading{" "}
            <Text component="span" size="sm" c="dimmed">
              H3
            </Text>
          </Title>
          <Text>Ghi nhận thay đổi về độ ẩm và chất lượng đất sau mùa mưa.</Text>
          <Text size="sm" c="dimmed">
            Secondary text for context and dates.
          </Text>
          <Text size="xs" c="var(--text-subtle)">
            Supporting text for constraints and hints.
          </Text>
          <Anchor href="#sample-records">Back to the sample list</Anchor>
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
  return (
    <Stack component="section" gap="md" aria-labelledby="form-examples">
      <Title id="form-examples" order={2}>
        Form inputs
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Entry fields</Title>
            <TextInput label="Field observation" placeholder="Nhập tên lần quan sát" />
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
            <DateInput
              label="Observation date"
              placeholder="Select or enter a date"
              valueFormat="DD/MM/YYYY"
            />
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
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Title order={3}>Selection and validation</Title>
            <Select label="Observation category" data={categories} defaultValue={categories[0]} />
            <MultiSelect
              label="Observation tags"
              data={categories}
              placeholder="Select tags"
              defaultValue={[categories[1]]}
            />
            <Group gap="md">
              <Checkbox label="Flag for follow-up" defaultChecked />
              <Switch label="Send reminders" />
            </Group>
            <Radio.Group label="Visibility" defaultValue="internal">
              <Group gap="md" mt="xs">
                <Radio label="Internal" value="internal" />
                <Radio label="Published" value="published" disabled />
              </Group>
            </Radio.Group>
            <Group align="flex-end" gap="xs">
              <Input.Wrapper id="control-comparison" label="Control comparison" flex="1 1 9rem">
                <Input
                  id="control-comparison"
                  ref={focusExample}
                  value={comparisonValue}
                  placeholder="Inspect the focus ring"
                  onChange={(event) => setComparisonValue(event.currentTarget.value)}
                />
              </Input.Wrapper>
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
            <TextInput label="Read-only code" value="NFV-001" readOnly />
            <TextInput label="Disabled field" defaultValue="Unavailable" disabled />
            <TextInput
              label="Invalid code"
              defaultValue="NFV"
              error="Include a three-digit record number."
            />
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

function NavigationExamples() {
  const [active, setActive] = useState("observations");
  return (
    <Stack component="section" gap="md" aria-labelledby="navigation-examples">
      <Title id="navigation-examples" order={2}>
        Navigation and floating controls
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper p="md" miw={0}>
          <Stack gap="md">
            <Breadcrumbs
              aria-label="Example breadcrumb"
              component="nav"
              style={{ flexWrap: "wrap" }}
            >
              <Anchor href="#sample-records">Showcase</Anchor>
              <Text aria-current="page">Navigation</Text>
            </Breadcrumbs>
            <Tabs defaultValue="overview">
              <Tabs.List>
                <Tabs.Tab value="overview">Overview</Tabs.Tab>
                <Tabs.Tab value="activity">Activity</Tabs.Tab>
                <Tabs.Tab value="history" disabled>
                  History
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="overview" pt="sm">
                Summary of sample field observations.
              </Tabs.Panel>
              <Tabs.Panel value="activity" pt="sm">
                One observation is waiting for review.
              </Tabs.Panel>
            </Tabs>
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
          <Stack gap="sm">
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
            <Group gap="sm">
              <Menu>
                <Menu.Target>
                  <Button variant="default" leftSection={<IconDots size={16} aria-hidden />}>
                    Menu
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Showcase navigation</Menu.Label>
                  <Menu.Item component="a" href="#sample-records">
                    Sample records
                  </Menu.Item>
                  <Menu.Item component="a" href="#detail-and-dialogs">
                    Dialogs
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Popover width={220} position="bottom-start" withArrow shadow="sm" returnFocus>
                <Popover.Target>
                  <Button variant="light">Popover</Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm">Use the width control above to preview narrow list layouts.</Text>
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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Stack gap="sm" miw={0}>
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
              <Text size="sm" c="dimmed">
                Try empty, error and retry states under{" "}
                <Anchor href="#sample-records">Sample records</Anchor>.
              </Text>
            </Stack>
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
          </SimpleGrid>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function ShowcaseComponents() {
  return (
    <>
      <ColorLibrary />
      <TypeExamples />
      <ActionExamples />
      <FormExamples />
      <NavigationExamples />
      <FeedbackExamples />
    </>
  );
}
