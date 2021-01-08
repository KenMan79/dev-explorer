import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Card,
  Container,
  Row,
  Col,
  Pagination,
  Spinner,
} from "react-bootstrap";

import AddressDisp from "src/components/Misc/Disp/AddressDisp/AddressDisp";
import { NetworkContext } from "src/services/network/networkProvider";

import { hexAddrToZilAddr, stripHexPrefix } from "src/utils/Utils";

import { useQuery, gql } from "@apollo/client";

import * as d3 from "d3";

import TransitionModal from "./TransitionModal";

import "./TransactionFlow.css";

interface IProps {
  hash: string;
}

const TransactionFlow: React.FC<IProps> = ({ hash }) => {
  const [transaction, setTransaction] = useState<any>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [modalDisplay, setModalDisplay] = useState(false);
  const [modalData, setModalData] = useState(undefined);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);

  const networkContext = useContext(NetworkContext);
  const { dataService, isIsolatedServer, apolloUrl } = networkContext!;

  const ref: any = useRef<SVGElement | null>();

  const TRANSACTION_QUERY = gql`
    query GetTransaction($customId: String!) {
      txFindByCustomId(customId: $customId) {
        fromAddr
        toAddr
        amount
        receipt {
          event_logs {
            address
            _eventname
            params {
              vname
              type
              value
            }
          }
          transitions {
            accepted
            addr
            depth
            msg {
              _tag
              _amount
              _recipient
              params {
                vname
                type
                value
              }
            }
          }
        }
      }
    }
  `;

  const { loading, error, data } = useQuery(TRANSACTION_QUERY, {
    variables: { customId: stripHexPrefix(hash) },
    context: {
      uri: apolloUrl,
    },
    fetchPolicy: "cache-and-network",
  });

  if (
    data &&
    data.txFindByCustomId.length &&
    data.txFindByCustomId[0] !== transaction
  ) {
    setTransaction(data.txFindByCustomId[0]);
  }

  const getNodeColor = async (node: {
    id: string;
    type?: string;
    color?: string;
  }) => {
    if (!dataService || isIsolatedServer === null) return "#035992";

    const colors = [
      {
        type: "caller",
        color: "#666",
      },
      {
        type: "contract",
        color: "orange",
      },
      {
        type: "user",
        color: "#035992",
      },
    ];

    try {
      if (node.type === undefined) {
        const targetContract = await dataService?.isContractAddr(node.id);

        node.type = targetContract ? "contract" : "user";
      }

      const exists = colors.find(
        (item: { type: string; color: string }) => item.type === node.type
      );

      return exists ? exists.color : "#035992";
    } catch (error) {
      return "#035992";
    }
  };

  const openModal = (d: any, link: any) => {
    document.body.classList.add("has-modal-open");
    console.log(link);
    setModalData(link);
    setModalDisplay(true);
  };

  const openNode = (d: any, node: any) => {
    window.location.href = `/address/${node.id}${window.location.search}`;
  };

  useEffect(() => {
    if (transaction) {
      const links: any = [
        {
          source: hexAddrToZilAddr(transaction.fromAddr),
          target: hexAddrToZilAddr(transaction.toAddr),
          amount: transaction.amount,
          index: 0,
          txData: transaction,
          receipt: transaction.receipt,
        },
      ];

      const nodes: any = [
        {
          id: hexAddrToZilAddr(transaction.fromAddr),
          type: "caller",
        },
        {
          id: hexAddrToZilAddr(transaction.toAddr),
          type: "contract",
        },
      ];

      console.log("nodes", nodes);
      console.log("links", links);

      if (transaction.receipt.transitions.length) {
        let ioo = 0;
        transaction.receipt.transitions.forEach(async (tr: any) => {
          ioo++;

          if (
            !nodes.find((node: any) => node.id === hexAddrToZilAddr(tr.addr))
          ) {
            nodes.push({
              id: hexAddrToZilAddr(tr.addr),
            });
          }

          if (
            !nodes.find(
              (node: any) => node.id === hexAddrToZilAddr(tr.msg._recipient)
            )
          ) {
            nodes.push({
              id: hexAddrToZilAddr(tr.msg._recipient),
            });
          }

          //console.log(transaction.receipt.event_logs, tr.msg._recipient);

          const events = transaction.receipt.event_logs.filter((evv: any) => {
            return evv.address === tr.msg._recipient;
          });

          links.push({
            source: hexAddrToZilAddr(tr.addr),
            target: hexAddrToZilAddr(tr.msg._recipient),
            data: { ...tr },
            txData: transaction,
            index: ioo,
            events: events,
          });
        });
      }
      Promise.all(
        nodes.map(
          async (element: { id: string; type?: string; color?: string }) => {
            element.color = await getNodeColor(element);
            return element;
          }
        )
      ).then(() => {
        setNodes(nodes);
        setLinks(links);
      });
    }
  }, [transaction]);

  useEffect(() => {
    setIsLoading(true);
    if (!dataService || isIsolatedServer === null) return;

    d3.select(ref.current).selectAll("*").remove();

    if (nodes.length) {
      const nodeWidth = 362;
      const nodeHeight = 40;

      // set the dimensions and margins of the graph
      const width = 1100,
        height = 550;

      // append the svg object to the body of the page
      const svg = d3
        .select(ref.current)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const link = svg
        .append("g")
        .attr("fill", "none")
        .attr("stroke-width", 1.5)
        .selectAll("path")
        .data(links);

      const linkLine = link
        .join("path")
        .attr("stroke", "#aaa")
        .attr("id", (d: any, index: number) => {
          return `linkLine-${index}`;
        })
        .attr("marker-end", (d: any) => {
          return `url(${new URL(`#arrow-${d.target}`, window.location.href)})`;
        })
        .on("click", openModal);

      const linkTextContainer = link
        .enter()
        .append("text")
        .attr("transform", "translate(0,15)")
        .style("cursor", "pointer")
        .on("click", openModal);

      linkTextContainer.append("title").text(function (d: any) {
        if (d.index === 0) {
          return "contract-call";
        }
        if (d.data && d.data.msg && d.data.msg._tag) {
          return d.data.msg._tag;
        }
        return "";
      });

      const linkText = linkTextContainer
        .append("textPath")
        .attr("class", "linkText")
        .text(function (d: any, i) {
          if (d.index === 0) {
            return "contract-call";
          }
          if (d.data && d.data.msg && d.data.msg._tag) {
            return d.data.msg._tag;
          }
          return "";
        })
        .style("font-size", "14px")
        .style("font-family", "monospace")
        .attr("fill", "#fff")
        .attr("xlink:xlink:href", (d: any, index: number) => {
          return `#linkLine-${index}`;
        });

      // Initialize the nodes
      const nodeg = svg.selectAll("rect").data(nodes).enter().append<Element>("g");

      const node = nodeg
        .append<Element>("rect")
        .attr("class", "node-rect")
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("stroke-width", 2)
        .attr("fill", (d: any) => d.color)
        .attr("x", -500)
        .attr("y", -500);

      node.on("click", openNode);

      const label = nodeg
        .append("text")
        .text(function (d: any) {
          return d.id;
        })
        .style("font-size", "14px")
        .style("font-family", "monospace")
        .style("cursor", "pointer")
        .attr("fill", "#fff")
        .attr("x", -500)
        .attr("y", -500)
        .on("click", openNode);

      node.append("title").text(function (d: any) {
        return d.id;
      });

      // Per-type markers, as they don't inherit styles.
      svg
        .append("defs")
        .selectAll("marker")
        .data(nodes)
        .join("marker")
        .attr("id", (d: any) => `arrow-${d.id}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", "#fff")
        .attr("d", "M0,-5L10,0L0,5");

      const linkArc = (d: any) => {
        const fromx = d.source.x + nodeWidth / 2;
        const fromy =
          d.target.y > d.source.y ? d.source.y + nodeHeight : d.source.y;

        const tox =
          d.target.y > d.source.y
            ? d.target.x + nodeWidth / 2
            : d.target.x + nodeWidth / 2;
        const toy =
          d.target.y > d.source.y
            ? d.target.y - 3
            : d.target.y + nodeHeight + 3;

        return `
          M${fromx},${fromy}
          A0,0 0 0,1 ${tox},${toy}
        `;
      };

      // This function is run at each iteration of the force algorithm, updating the nodes position.
      const ticked = () => {
        node
          .attr("x", function (d: any) {
            return d.x;
          })
          .attr("y", function (d: any) {
            return d.y;
          });

        linkLine.attr("d", linkArc);

        label
          .attr("x", function (d: any) {
            return d.x + 4;
          })
          .attr("y", function (d: any) {
            return d.y + nodeHeight / 2 + 5;
          });

        linkTextContainer.attr("x", function (d: any) {
          return 70;
        });

        setIsLoading(false);
      };

      // Let's list the force we wanna apply on the network
      const simulation = d3
        .forceSimulation(nodes) // Force algorithm is applied to data.nodes
        .force(
          "link",
          d3
            .forceLink() // This force provides links between nodes
            .id(function (d: any) {
              return d.id;
            }) // This provide  the id of a node
            .links(links) // and this the list of links
        )
        //.force("charge", d3.forceManyBody().strength(-300)) // This adds repulsion between nodes. Play with the -400 for the repulsion strength
        .force("center", d3.forceCenter(width / 3, height / 2)) // This force attracts nodes to the center of the svg area
        //.force("x", d3.forceX())
        //.force("y", d3.forceY())
        .force("collide", d3.forceCollide(180))
        .on("end", ticked);

      node.call(
        d3.drag().on("drag", () => {
          console.log("dragg");
        })
      );
    }
  }, [nodes, links]);

  const closeModal = () => {
    document.body.classList.remove("has-modal-open");
    setModalDisplay(false);
  };

  return (
    <div>
      {loading || isLoading ? (
        <div className="center-spinner">
          <Spinner animation="border" />
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        transaction && (
          <div className="mt-4">
            <h3 className="mb-4">Transaction Flow</h3>

            <div className="transaction-flow d-flex p-0">
              <TransitionModal
                modalData={modalData}
                display={modalDisplay}
                closeModal={closeModal}
              />
              <div id="d3-viewer" ref={ref}></div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default TransactionFlow;
